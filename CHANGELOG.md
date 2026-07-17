# Changelog

## [2.6.0](https://github.com/ljcl/strava-mcp/compare/v2.5.0...v2.6.0) (2026-07-17)


### Features

* add fitness-trend, hill, and interval analysis tools ([#202](https://github.com/ljcl/strava-mcp/issues/202)) ([2d367cc](https://github.com/ljcl/strava-mcp/commit/2d367ccc51d5d728480897676bc556aa4dd5cb1c))
* add get-aerobic-analysis tool with decoupling, EF, and IF ([#201](https://github.com/ljcl/strava-mcp/issues/201)) ([4c7b5c7](https://github.com/ljcl/strava-mcp/commit/4c7b5c72bbb239a912de50a33fafaab945cb33b7))
* add shared fullscreen toggle and activity-chart brush zoom ([#206](https://github.com/ljcl/strava-mcp/issues/206)) ([75ac8b2](https://github.com/ljcl/strava-mcp/commit/75ac8b2963bffc960a01c20301191131517545c5)), closes [#35](https://github.com/ljcl/strava-mcp/issues/35)
* add view-activity-zones MCP App for HR/power time-in-zone ([#203](https://github.com/ljcl/strava-mcp/issues/203)) ([5a6140f](https://github.com/ljcl/strava-mcp/commit/5a6140fe3ef0b372a16e83b594ca5601c8d06e0f))
* support waypoint annotations in view-route-map ([#191](https://github.com/ljcl/strava-mcp/issues/191)) ([0320f30](https://github.com/ljcl/strava-mcp/commit/0320f30c86431ea9a1613d32efbf269edc7ec8c5)), closes [#185](https://github.com/ljcl/strava-mcp/issues/185)


### Bug Fixes

* surface app-handler token errors as isError and return -32700 for malformed /mcp JSON ([#187](https://github.com/ljcl/strava-mcp/issues/187)) ([fa4227b](https://github.com/ljcl/strava-mcp/commit/fa4227b00b2aa5b42898fc3c32ae5c2da7aef7ad))

## [2.5.0](https://github.com/ljcl/strava-mcp/compare/v2.4.0...v2.5.0) (2026-07-16)


### Features

* add compare-activities MCP App (view-compare-activities) ([#178](https://github.com/ljcl/strava-mcp/issues/178)) ([9ae974e](https://github.com/ljcl/strava-mcp/commit/9ae974e5c8851816556049e13e37ceb4a4680c1f))
* add create-activity tool for manual entries ([#173](https://github.com/ljcl/strava-mcp/issues/173)) ([d16de67](https://github.com/ljcl/strava-mcp/commit/d16de67f2893bb1d1212d77ce54efee50e10d15b))
* add model-context sync to activity-segments ([#175](https://github.com/ljcl/strava-mcp/issues/175)) ([efe9c02](https://github.com/ljcl/strava-mcp/commit/efe9c025bd37a9637759f38e2ed20fc2f63e564f))
* add screen-reader chart descriptions, dark-story helper, and tier token docs ([#177](https://github.com/ljcl/strava-mcp/issues/177)) ([663c71c](https://github.com/ljcl/strava-mcp/commit/663c71c6a181bbfbb4ae66f4f4bad24988012eaf))
* add training-load trend MCP App (view-training-load) ([#176](https://github.com/ljcl/strava-mcp/issues/176)) ([468bfd4](https://github.com/ljcl/strava-mcp/commit/468bfd4a131d8289b561b61a2b454d46ec5936c8))
* shared LoadingState, CardHeader, and EmptyState with ui chrome stories ([#179](https://github.com/ljcl/strava-mcp/issues/179)) ([78509e8](https://github.com/ljcl/strava-mcp/commit/78509e87f9b8d6e9675ae107aab7babeeac60cee))
* shared LoadingState/CardHeader/EmptyState and ui chrome stories ([78509e8](https://github.com/ljcl/strava-mcp/commit/78509e87f9b8d6e9675ae107aab7babeeac60cee))

## [2.4.0](https://github.com/ljcl/strava-mcp/compare/v2.3.0...v2.4.0) (2026-07-13)


### Features

* add get-activity-laps tool, MCP prompts, and structured /health ([#148](https://github.com/ljcl/strava-mcp/issues/148)) ([abb98ed](https://github.com/ljcl/strava-mcp/commit/abb98ed201b38b1396ea3a8b8326e92ee2061469))
* export activity GPX built from streams ([#158](https://github.com/ljcl/strava-mcp/issues/158)) ([be52920](https://github.com/ljcl/strava-mcp/commit/be52920a607c3e7f782a19f14ab3ee77a67fe85a))


### Bug Fixes

* bound 401 refresh-retry and accept 64-bit string ids in tool inputs ([#143](https://github.com/ljcl/strava-mcp/issues/143)) ([14fba2c](https://github.com/ljcl/strava-mcp/commit/14fba2c74f4b72be02de2ec92f7fc6f8701614ff))
* bound best-efforts pagination, align overlay runs, keep tooltip zeros, sync turbo pin ([#145](https://github.com/ljcl/strava-mcp/issues/145)) ([3292a6d](https://github.com/ljcl/strava-mcp/commit/3292a6d186217c4bd83dac8feba8ef773e1f5dfb))
* enforce tool input schemas at dispatch, add optional /mcp bearer auth, theme overlay tooltip ([#146](https://github.com/ljcl/strava-mcp/issues/146)) ([aff7267](https://github.com/ljcl/strava-mcp/commit/aff72672e21086d5e4dd9d03aca4b34b2e674de8))
* reject non-numeric route ids and contain export paths in route export tools ([#141](https://github.com/ljcl/strava-mcp/issues/141)) ([d332012](https://github.com/ljcl/strava-mcp/commit/d332012f33a8734c781afa3f5a43f6955cdb9a8e))
* validate OAuth state and stop /auth routes overwriting stored tokens ([#147](https://github.com/ljcl/strava-mcp/issues/147)) ([a663af3](https://github.com/ljcl/strava-mcp/commit/a663af3bc77258f94c457a6597af1273be55f622))


### Performance Improvements

* stop legend hover re-rendering the ActivityChart Recharts tree ([#151](https://github.com/ljcl/strava-mcp/issues/151)) ([f28c718](https://github.com/ljcl/strava-mcp/commit/f28c7188c96fabc9db0d42b70f6173c92abf8089))

## [2.3.0](https://github.com/ljcl/strava-mcp/compare/v2.2.0...v2.3.0) (2026-07-10)


### Features

* route-map screen-reader description and alt text ([#104](https://github.com/ljcl/strava-mcp/issues/104)) ([d330153](https://github.com/ljcl/strava-mcp/commit/d3301539e7e588241199ef67d5b5765fef89bdfc))


### Bug Fixes

* recover from revoked refresh tokens and handle SIGTERM shutdown ([#100](https://github.com/ljcl/strava-mcp/issues/100)) ([72f911e](https://github.com/ljcl/strava-mcp/commit/72f911e3646aa16eaca3a70219cd77aa280e88bc))

## [2.2.0](https://github.com/ljcl/strava-mcp/compare/v2.1.0...v2.2.0) (2026-06-22)


### Features

* activity-segments MCP app ([#91](https://github.com/ljcl/strava-mcp/issues/91)) ([4924ce3](https://github.com/ljcl/strava-mcp/commit/4924ce35ae3171e3b5885a2b59b512f62b856e62))

## [2.1.0](https://github.com/ljcl/strava-mcp/compare/v2.0.1...v2.1.0) (2026-06-22)


### Features

* list all covering segments in one route-map tooltip with lean outlines ([#89](https://github.com/ljcl/strava-mcp/issues/89)) ([0f496fd](https://github.com/ljcl/strava-mcp/commit/0f496fd31b3842b663447fea9facb8d9edf97119))
* list all covering segments in one route-map tooltip, lean outlines ([0f496fd](https://github.com/ljcl/strava-mcp/commit/0f496fd31b3842b663447fea9facb8d9edf97119))

## [2.0.1](https://github.com/ljcl/strava-mcp/compare/v2.0.0...v2.0.1) (2026-06-22)


### Bug Fixes

* render route-map track over basemap by using MapLibre CSP worker ([#86](https://github.com/ljcl/strava-mcp/issues/86)) ([4ac7e42](https://github.com/ljcl/strava-mcp/commit/4ac7e42cccd8108cf77104ebdaa5f97894741acc))

## [2.0.0](https://github.com/ljcl/strava-mcp/compare/v1.4.1...v2.0.0) (2026-06-22)


### ⚠ BREAKING CHANGES

* remove read tools duplicated by the official Strava MCP connector ([#84](https://github.com/ljcl/strava-mcp/issues/84))

### Features

* remove read tools duplicated by the official Strava MCP connector ([#84](https://github.com/ljcl/strava-mcp/issues/84)) ([e9c836e](https://github.com/ljcl/strava-mcp/commit/e9c836e3f961afb12278e505595d778e3be2307e))

## [1.4.1](https://github.com/ljcl/strava-mcp/compare/v1.4.0...v1.4.1) (2026-06-11)


### Bug Fixes

* harden basemap layer setup so one bad add cannot blank every overlay ([#74](https://github.com/ljcl/strava-mcp/issues/74)) ([d779b4d](https://github.com/ljcl/strava-mcp/commit/d779b4d729c7bf0ec52af8defe53974c284908c4))

## [1.4.0](https://github.com/ljcl/strava-mcp/compare/v1.3.1...v1.4.0) (2026-06-10)


### Features

* MapLibre + OpenFreeMap basemap behind a route-map toggle ([#72](https://github.com/ljcl/strava-mcp/issues/72)) ([bed3884](https://github.com/ljcl/strava-mcp/commit/bed3884c1f27c4ce4aa594327ab886c4f4f52592))
* metric-coloured route-map track with hover scrub and elevation strip ([#68](https://github.com/ljcl/strava-mcp/issues/68)) ([143a6e7](https://github.com/ljcl/strava-mcp/commit/143a6e70e929ca4bf3bda4a6d616d82eb326402b))
* route-map zoom/pan and track annotations (splits, segments, photos) ([#70](https://github.com/ljcl/strava-mcp/issues/70)) ([4d9c845](https://github.com/ljcl/strava-mcp/commit/4d9c8459a6aee3c3e37dc67ba6b46c45165bb385))

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
