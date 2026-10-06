//! Synthetic, relay-only deployment probe. Never reads DSH identities or content.
use anyhow::{bail, ensure, Context, Result};
use clap::{Parser, Subcommand};
use iroh::{endpoint::presets, Endpoint, EndpointAddr, RelayConfig, RelayMode, RelayUrl, SecretKey, Watcher};
use std::{path::PathBuf, time::Duration};
use tether_core::{load_or_create_secret, write_private};
use tokio::time::{sleep, timeout};

const ALPN: &[u8] = b"dsh-tether-relay-probe/1";
#[derive(Parser)]
struct Cli { #[command(subcommand)] command: Command }
#[derive(Subcommand)]
enum Command {
    Init { #[arg(long)] directory: PathBuf },
    Check { #[arg(long)] directory: PathBuf, #[arg(long)] relay: RelayUrl },
}
fn keys(dir: &PathBuf) -> Result<(SecretKey, SecretKey)> {
    Ok((load_or_create_secret(&dir.join("synthetic-host.key"))?, load_or_create_secret(&dir.join("synthetic-phone.key"))?))
}
async fn endpoint(key: SecretKey, relay: &RelayUrl) -> Result<Endpoint> {
    Ok(Endpoint::builder(presets::Minimal)
        .secret_key(key)
        .relay_mode(RelayMode::Custom(RelayConfig::new(relay.clone(), None).into()))
        .clear_ip_transports()
        .alpns(vec![ALPN.to_vec()]).bind().await?)
}
async fn check(dir: PathBuf, relay: RelayUrl) -> Result<()> {
    ensure!(relay.as_str().starts_with("https://"), "Probe requires verified HTTPS");
    let (host_key, phone_key) = keys(&dir)?;
    let host = endpoint(host_key, &relay).await?;
    let phone = endpoint(phone_key, &relay).await?;
    let host_addr = EndpointAddr::new(host.id()).with_relay_url(relay.clone());
    let expected_peer = phone.id();
    let server = host.clone();
    let accept = tokio::spawn(async move {
        let conn = server.accept().await.context("host accept closed")?.await?;
        ensure!(conn.remote_id() == expected_peer, "Unexpected synthetic peer");
        let (mut tx, mut rx) = conn.accept_bi().await?;
        let bytes = rx.read_to_end(131072).await?;
        ensure!(bytes == vec![0x5a; 65536], "Payload mismatch");
        tx.write_all(&bytes).await?;
        tx.finish()?;
        let _ = tx.stopped().await;
        Ok::<(), anyhow::Error>(())
    });
    let conn = phone.connect(host_addr, ALPN).await?;
    let (mut tx, mut rx) = conn.open_bi().await?;
    tx.write_all(&vec![0x5a; 65536]).await?;
    tx.finish()?;
    ensure!(rx.read_to_end(131072).await? == vec![0x5a; 65536], "Echo mismatch");
    accept.await??;
    ensure!(conn.paths().iter().any(|p| p.is_selected() && p.remote_addr().is_relay()), "Relay path not selected");
    conn.close(0u32.into(), b"synthetic probe complete");
    // This identity is never added to the allowlist. Require an explicit rejection,
    // not a connection timeout, to prove access control is working.
    let rejected = endpoint(SecretKey::generate(), &relay).await?;
    let mut denied = false;
    for _ in 0..80 {
        if rejected.home_relay_status().get().iter().filter_map(|s| s.last_error()).any(|e| {
            let s = format!("{e:#}").to_lowercase();
            s.contains("not authorized") || s.contains("forbidden") || s.contains("403")
        }) { denied = true; break; }
        sleep(Duration::from_millis(250)).await;
    }
    rejected.close().await;
    phone.close().await;
    host.close().await;
    if !denied { bail!("No explicit relay rejection observed for unauthorized identity"); }
    println!("{{\"relayOnlyEchoBytes\":65536,\"selectedPath\":\"relay\",\"unauthorizedEndpointDenied\":true}}");
    Ok(())
}
#[tokio::main]
async fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Init { directory } => {
            let (host, phone) = keys(&directory)?;
            write_private(&directory.join("public-ids.json"), &serde_json::to_vec(&vec![host.public().to_string(), phone.public().to_string()])?)?;
            println!("Synthetic keys initialized; public IDs saved without printing secrets");
        }
        Command::Check { directory, relay } => timeout(Duration::from_secs(70), check(directory, relay)).await??,
    }
    Ok(())
}
