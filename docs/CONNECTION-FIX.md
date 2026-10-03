# Connection recovery

Live logs on October 3 showed repeated HTTP 413 responses for a 19,333-byte input packet. The endpoint's limit is 8 KiB. Previously, the client batched up to 64 full commands, resent the same rejected batch indefinitely, and eventually filled its 120-command prediction queue and froze.

Both transports now send compact commands in contiguous sequence order, at most 24 per packet and at most 7,000 UTF-8 bytes. Omitted false flags retain their server defaults; action pulses and numeric precision are preserved. Authority, ammunition, collision and rate validation remain server owned.

Prediction is capped at 30 outstanding fixed simulation steps (one second). Under a sustained outage movement waits for authority instead of simulating four seconds ahead and making a large correction later. Fetches time out after five seconds; failed input requests back off up to two seconds, preserving commands for deduplicated retries. Expired HTTP sessions attempt a fresh join. Fifteen seconds without an authoritative state returns to the menu with a connection-loss message rather than leaving a permanently frozen match. A temporarily suspended mobile app may need to rejoin.

`npm run test:connection` runs two real clients against the authoritative HTTP worker, injects a rejected packet and a hung request, then adds 250ms latency. It checks acknowledgements resume, prediction stays bounded, packets fit the limits and both clients remain connected. Unit checks cover compact command equivalence, pulse preservation and request timeout/status behavior. Existing latency, authority and cross-device suites remain in place.

The public hosted service still uses serialized HTTP/SQL room updates, with higher latency than the dedicated WebSocket server. These fixes address a verified permanent-freeze loop and bound recovery; they do not remove mobile network latency or certify every cellular connection.
