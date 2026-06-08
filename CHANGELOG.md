# Changelog

## [1.3.1](https://github.com/ljcl/strava-mcp/compare/v1.3.0...v1.3.1) (2026-06-08)


### Bug Fixes

* make get-athlete-stats athleteId optional (default to authenticated athlete) ([#67](https://github.com/ljcl/strava-mcp/issues/67)) ([1259e0a](https://github.com/ljcl/strava-mcp/commit/1259e0a4ec281a9a55c667faa9ed4e8fc12648e8))


### Performance Improvements

* cache immutable Strava responses (activity detail, streams, profile) ([#63](https://github.com/ljcl/strava-mcp/issues/63)) ([4c0102a](https://github.com/ljcl/strava-mcp/commit/4c0102a678f47681bc6d5dd0e5cb93df16e18f64))

## [1.3.0](https://github.com/ljcl/strava-mcp/compare/v1.2.0...v1.3.0) (2026-06-08)


### Features

* add route-map MCP App ([#53](https://github.com/ljcl/strava-mcp/issues/53)) ([c7a1963](https://github.com/ljcl/strava-mcp/commit/c7a1963ef394fde421a3c68c24cfb7a9c71bf9c9)), closes [#26](https://github.com/ljcl/strava-mcp/issues/26)

## [1.2.0](https://github.com/ljcl/strava-mcp/compare/v1.1.0...v1.2.0) (2026-06-08)


### Features

* add get-activity-zones tool ([#40](https://github.com/ljcl/strava-mcp/issues/40)) ([558806a](https://github.com/ljcl/strava-mcp/commit/558806a0f55b7f03022437c39fd2b7dd98b0c886))
* distroless multi-arch (amd64+arm64) container image ([#17](https://github.com/ljcl/strava-mcp/issues/17)) ([c777bae](https://github.com/ljcl/strava-mcp/commit/c777bae372e3145fa3e81583385927ab19e62c2d))
* **server:** surface Strava rate-limit headers and add 429/transient backoff ([#46](https://github.com/ljcl/strava-mcp/issues/46)) ([be00295](https://github.com/ljcl/strava-mcp/commit/be002957f942a537fa8c3333b5ec2fb944b98377))


### Bug Fixes

* serialize token refresh and write tokens.json atomically ([#47](https://github.com/ljcl/strava-mcp/issues/47)) ([3111185](https://github.com/ljcl/strava-mcp/commit/3111185707211518fa5c62ee0a032362aa3a9a5b)), closes [#22](https://github.com/ljcl/strava-mcp/issues/22)

## [1.1.0](https://github.com/ljcl/strava-mcp/compare/strava-mcp-v1.0.0...strava-mcp-v1.1.0) (2026-06-06)


### Features

* tool-quality and MCP App improvements ([9872da6](https://github.com/ljcl/strava-mcp/commit/9872da65843e8dfad9227d406e9f9f0259756ca5))
