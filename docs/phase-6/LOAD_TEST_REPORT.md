# Phase 6 Load Test Report

## Status

`PASS`

## Executed on July 13, 2026

Evidence: `docs/phase-6/evidence/network/load-tests.json`

## Final Load Results

- `run100`
  connection `100%`
  join `100%`
  save `100%`
  submit `100%`
- `run250`
  connection `100%`
  join `100%`
  save `100%`
  submit `100%`
- `run500`
  connection `100%`
  join `100%`
  save `100%`
  submit `100%`

## Storm And Fan-Out Results

- Reconnect storm: `75/75` reconnect joins succeeded
- Duplicate-save storm: duplicate answer groups `0`
- Duplicate-submit storm: duplicate submit side effects `0`
- Heartbeat load: `60/60` heartbeats succeeded
- Teacher monitor fan-out: `5/5` initial monitor receipts succeeded

## Latency Summary

- `run100`
  save `p50=2246ms` `p95=2447ms` `p99=2466ms`
  submit `p50=5766ms` `p95=6051ms` `p99=6094ms`
- `run250`
  save `p50=2315ms` `p95=2466ms` `p99=2475ms`
  submit `p50=6206ms` `p95=6508ms` `p99=6587ms`
- `run500`
  save `p50=2328ms` `p95=2484ms` `p99=2552ms`
  submit `p50=6119ms` `p95=6720ms` `p99=6832ms`

## Integrity Outcome

- Duplicate answer groups: `0`
- Duplicate attempt groups: `0`
- Harness status: `PASS`

## Notes

- The final passing run used the controlled batch configuration recorded in the artifact:
  connect `50/40ms`
  join `25/75ms`
  start `10/100ms`
  save `20/40ms`
  heartbeat `20/25ms`
  submit `20/40ms`
- Phase 7 should not begin automatically.
