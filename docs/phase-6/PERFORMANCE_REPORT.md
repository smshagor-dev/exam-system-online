# Phase 6 Performance Report

## Status

`PASS`

## Source

`docs/phase-6/evidence/network/load-tests.json`

## Final Capacity Proof

- `100` concurrent students: `PASS`
- `250` concurrent students: `PASS`
- `500` concurrent students: `PASS`

## Resource Summary

- Server working set:
  before `run100`: `259.34 MB`
  after `run100`: `347.19 MB`
  after `run500`: `558.48 MB`
  final: `542.92 MB`
- Server CPU seconds:
  before `run100`: `14.8`
  after `run100`: `34.48`
  after `run500`: `184.89`
  final: `210.92`
- Event-loop lag max:
  `run100`: `58.29 ms`
  `run250`: `62.91 ms`
  `run500`: `69.27 ms`

## Redis Summary

- Redis memory in final run: `2.90 MB`
- Peak Redis memory in final run: `12.26 MB`
- Total commands processed: `233596`
- Rejected connections: `0`
- Duplicate DB records: `0`

## Assessment

The final controlled Phase 6 load run produced credible end-to-end metrics for `100`, `250`, and `500` concurrent students with `100%` join/save/submit success and no duplicate records.
