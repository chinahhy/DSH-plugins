use super::*;
use tokio::time::timeout;
use tokio::io::AsyncWriteExt;

#[test]
fn requires_explicit_data_directory_and_has_no_other_modes() {
    assert!(Cli::try_parse_from(["tether-host", "host"]).is_err());
    assert!(Cli::try_parse_from(["tether-host", "phone-sim"]).is_err());
    assert!(Cli::try_parse_from(["tether-host", "id"]).is_err());
    assert!(Cli::try_parse_from(["tether-host", "host", "--data-dir", "/fixture"]).is_ok());
}

#[test]
fn corrupt_allowlist_does_not_silently_reset() {
    let dir = std::env::temp_dir().join(format!("tether-corrupt-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("paired.json");
    std::fs::write(&path, b"invalid").unwrap();
    assert!(load_store(&path).is_err());
    std::fs::remove_dir_all(dir).unwrap();
}

/// Talks the same raw JSON messages as ios-only, over real encrypted iroh streams.
/// All peer addresses are supplied directly, with no relay dependency.
#[tokio::test]
async fn pairing_http_proxy_notifications_reconnect_and_revocation() -> Result<()> {
    timeout(Duration::from_secs(25), transport_scenario()).await??;
    Ok(())
}

async fn transport_scenario() -> Result<()> {
    let dir = std::env::temp_dir().join(format!("tether-transport-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    let host = Endpoint::builder(presets::N0).relay_mode(iroh::RelayMode::Disabled)
        .alpns(vec![ALPN.to_vec()]).bind().await?;
    let phone = Endpoint::builder(presets::N0).relay_mode(iroh::RelayMode::Disabled).bind().await?;
    let tcp = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let target = tcp.local_addr()?;
    let state = Arc::new(Mutex::new(HostState {
        store_path: dir.join("paired.json"), store: PairedStore::default(),
        pairing: Some(PairingWindow { code: "123456".into(), deadline: tokio::time::Instant::now() + PAIRING_TTL, attempts: 0 }),
        conns: HashMap::new(), proxy_auth: Some(Arc::new(ProxyAuth {
            cookie: "fixture=synthetic".into(), authority: target.to_string(),
        })),
    }));
    let host_accept = host.clone(); let host_state = state.clone();
    let acceptor = tokio::spawn(async move {
        while let Some(incoming) = host_accept.accept().await {
            let state = host_state.clone();
            tokio::spawn(async move { let _ = handle_phone(incoming, state, Some(target)).await; });
        }
    });
    // Wrong code must be explicitly rejected; three failures close the window.
    for attempt in 0..3 {
        let conn = phone.connect(host.addr(), ALPN).await?;
        let (mut tx, mut rx) = conn.open_bi().await?;
        write_line(&mut tx, r#"{"type":"pair","code":"000000","name":"synthetic iOS"}"#).await?;
        let value: serde_json::Value = serde_json::from_str(&read_line_bounded(&mut rx, MAX_LINE).await?)?;
        assert_eq!(value["type"], "pair-fail");
        assert_eq!(value["reason"], "bad-code");
        conn.close(0u8.into(), b"test");
        if attempt == 2 { assert!(state.lock().await.pairing.is_none()); }
    }
    state.lock().await.pairing = Some(PairingWindow { code: "123456".into(), deadline: tokio::time::Instant::now() + PAIRING_TTL, attempts: 0 });
    let conn = phone.connect(host.addr(), ALPN).await?;
    let (mut control_tx, mut control_rx) = conn.open_bi().await?;
    write_line(&mut control_tx, r#"{"type":"pair","code":"123456","name":"synthetic iOS"}"#).await?;
    assert_eq!(read_line_bounded(&mut control_rx, MAX_LINE).await?, r#"{"type":"pair-ok"}"#);
    assert_eq!(load_store(&dir.join("paired.json"))?.devices.len(), 1);
    // Real proxy stream reaches only the fixed loopback destination and injects auth.
    let server = tokio::spawn(async move {
        let (mut socket, _) = tcp.accept().await.unwrap();
        let head = read_request_head(&mut socket).await.unwrap();
        assert!(head.contains("cookie: fixture=synthetic\r\n"));
        assert!(head.contains("x-dsh-tether-remote: 1\r\n"));
        assert!(!head.contains("x-dsh-tether-remote: 0\r\n"));
        assert!(head.contains("connection: close\r\n"));
        socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK").await.unwrap();
        socket.shutdown().await.unwrap();
    });
    let (mut tx, mut rx) = conn.open_bi().await?;
    write_line(&mut tx, r#"{"type":"proxy"}"#).await?;
    tx.write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1:39411\r\nOrigin: http://127.0.0.1:39411\r\nx-dsh-tether-remote: 0\r\n\r\n").await?;
    tx.finish()?;
    let response = rx.read_to_end(4096).await?;
    assert!(response.ends_with(b"OK")); server.await?;
    broadcast(&state, r#"{"type":"approval","id":"fixture-call","tool_name":"fixture","reason":"synthetic"}"#.into()).await;
    let event: serde_json::Value = serde_json::from_str(&read_line_bounded(&mut control_rx, MAX_LINE).await?)?;
    assert_eq!(event["type"], "approval");
    broadcast(&state, r#"{"type":"approval-cancel","id":"fixture-call"}"#.into()).await;
    assert!(read_line_bounded(&mut control_rx, MAX_LINE).await?.contains("approval-cancel"));
    let previous_id = state.lock().await.conns.get(&phone.id().to_string()).unwrap().conn.stable_id();
    conn.close(0u8.into(), b"reconnect");
    let reconnect = phone.connect(host.addr(), ALPN).await?;
    let (mut tx, _rx) = reconnect.open_bi().await?;
    write_line(&mut tx, r#"{"type":"hello","name":"synthetic iOS"}"#).await?;
    // Wait until the new Hello has registered, then revoke and close exactly that connection.
    loop {
        let current = state.lock().await.conns.get(&phone.id().to_string()).map(|p| p.conn.clone());
        if let Some(current) = current {
            if current.stable_id() != previous_id && current.close_reason().is_none() {
                let mut s = state.lock().await;
                s.store.devices.clear(); save_store(&s.store_path, &s.store)?;
                s.conns.remove(&phone.id().to_string()).unwrap().conn.close(1u8.into(), b"forgotten");
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    reconnect.closed().await;
    assert!(load_store(&dir.join("paired.json"))?.devices.is_empty());
    host.close().await; phone.close().await; acceptor.abort();
    std::fs::remove_dir_all(dir)?;
    Ok(())
}
