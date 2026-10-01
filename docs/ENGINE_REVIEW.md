# 구현 플랫폼 검토: 웹(three.js) vs Unity

> 작성 기준일 2026-09-30. 버전·가격·지원 현황은 자주 바뀝니다. 아래 사실 관계는 모두 출처를 달았습니다.
> 출처를 확인하지 못한 내용은 **[미검증]**, 필자의 판단은 **[판단]**으로 표시했습니다.
> 조사 한계: 일부 공식 페이지(unity.com, docs.unity3d.com 등)는 조사 환경에서 직접 열람이 막혀 검색 결과 요약으로 확인했습니다(표에 SE로 표기).

## 1. 결론

**목표에 따라 답이 달라집니다.** [판단]

| 목표 | 권장 | 이유 |
|---|---|---|
| 지금 단계: 콘셉트 검증, 링크로 바로 공유하는 플레이어블 데모, 1인 개발 | **웹(three.js)** — 이번 구현 | 설치 없이 URL로 실행되고, 번들이 작고(이 게임 JS 약 215 KB gzip), 라이선스 비용과 벤더 리스크가 없습니다. 320×240 저해상도라 추적 카메라로 방 전체를 보여 줘도 렌더링 부하가 작아 웹의 약점이 드러나지 않습니다. |
| 다음 단계: 스팀·콘솔 상용 출시, 스키닝 캐릭터·컷신·대량 아트 에셋, 아티스트·디자이너와 협업 | **Unity** (대안: Godot) | 에디터, 애니메이션 리타깃, 라이트맵 베이크, 타임라인, 멀티플랫폼 빌드 같은 제작 도구가 생산성을 좌우합니다. |

권장 경로는 **웹으로 재미를 검증한 뒤 Unity로 본 개발**하는 2단계입니다. [판단] 이 프로젝트는 방·카메라 존·퍼즐 상태를 데이터와 순수 함수로 분리해 두었기 때문에 옮기기 어렵지 않습니다(6장).

## 2. 확인된 사실 (2026-09 기준)

### 2.1 Unity의 웹 빌드

| 항목 | 내용 | 출처 |
|---|---|---|
| 그래픽 API | WebGL 1은 2023.1 알파에서 제거되어 Unity 6은 **WebGL 2 전용**입니다. | [S8] (SE) |
| WebGPU | 6.1(2024-12)에 실험 기능으로 공개됐습니다. 6.3 LTS 매뉴얼에서도 "Experimental"입니다. **6.6(비 LTS, 2026-08)에서 실험 딱지를 뗐지만 기본값은 여전히 WebGL 2**입니다. | [S10][S11][S12] (SE) |
| LTS 현황 | 6.0 LTS는 2024-10-17 출시, 지원은 2026-10 전후 종료. 현재 LTS는 6.3(2025-12-04). 6.7 LTS는 2026년 4분기 예정. | [S1][S2][S3][S7] (SE) |
| 모바일 브라우저 | Unity 6부터 공식 지원합니다(매뉴얼 기준 iOS Safari 15+, Android Chrome 58+). | [S1][S15] (SE) |
| 멀티스레드 | 웹에서는 C# 멀티스레딩을 지원하지 않습니다. Burst 잡의 멀티스레드 실행은 6.4부터 공식 지원하며 COOP/COEP 헤더가 필요합니다. | [S16][S17][S18] (SE) |
| 메모리 | 힙은 최대 4 GB이며 2048 MB를 권장합니다. 6.6의 Wasm64(최대 16 GB)는 Safari·iOS Safari에서 쓸 수 없습니다. | [S19][S21][S35] |
| 오디오 | Web Audio 기반의 "기본 기능"만 제공합니다. AudioMixer는 볼륨 조절만 가능하고 이펙트는 지원하지 않습니다. | [S22] (SE) |
| 기타 제약 | Reflection.Emit 불가(AOT), 원시 소켓 불가(Fetch·WebSocket·WebRTC 사용), VideoClip 대신 URL 재생. | [S16][S24][S25] (SE) |
| 배포 | Brotli(권장)·Gzip 압축을 쓰며, 서버의 `Content-Encoding` 설정이 필요합니다. 설정할 수 없으면 "Decompression Fallback"을 켭니다. | [S26][S27] (SE) |
| 빌드 용량 | 공식 수치는 찾지 못했습니다 **[미검증]**. 참고용 개인 측정(Unity 6.0.23, Brotli): 기본 3D URP 템플릿 10.7 MB, 최대 스트리핑 2.0 MB. | [S28] (일화적 자료) |

### 2.2 Unity 라이선스와 비용

| 항목 | 내용 | 출처 |
|---|---|---|
| Runtime Fee | 2024-09-12 **취소**. | [S29] (SE) |
| Personal | 무료. 매출·투자 합계 상한이 US$10만에서 **US$20만**으로 올랐고(Unity 6부터), Unity 6 Personal은 스플래시 화면이 선택 사항입니다. | [S29][S30] (SE) |
| Pro 가격 | 2025-01-01 8% 인상(연 US$2,200/석), 2026-01-12 5% 추가 인상(**연 US$2,310** 또는 월 US$210). 매출·투자 US$20만 초과 시 Pro, US$2,500만 초과 시 Enterprise가 필요합니다. | [S29][S31][S32][S33] (SE) |
| 기타 | 6.3부터 Havok 물리가 Pro·Enterprise·Industry 요금제에서 빠졌습니다. | [S32][S33] (SE) |

### 2.3 웹 네이티브 엔진과 기반 기술

| 항목 | 내용 | 출처 |
|---|---|---|
| three.js | MIT 라이선스. 현재 r186(0.186.0: 2026-09-08, 0.186.1: 2026-09-24). r186부터 ESM 전용입니다. | [S34] (D) |
| three.js WebGPU | `three/webgpu` 진입점은 r171(2024-11)에 생겼습니다. 공식 매뉴얼(2026-07 수정)은 WebGPURenderer를 **"아직 실험 단계"**로 적고 있습니다. "r171부터 프로덕션 준비 완료"라는 제3자 주장은 공식 문서로 뒷받침되지 않습니다. | [S36][S37] (D) |
| three.js 용량 | 조사 측 측정(esbuild): three 전체 743 KB(minified) / 189 KB(gzip), 최소 장면 534 KB / 133 KB(gzip). **이 게임의 실측: JS 773 KB min / 215 KB gzip, CSS 13 KB.** | 조사 측정, 본 저장소 빌드 로그 |
| Babylon.js | Apache-2.0. 9.0 출시(2026-03-26), 최신 9.28.0. 브라우저 기반 Node Material Editor 제공. | [S39][S40][S41] |
| PlayCanvas | 엔진 MIT. 최신 2.22.6. WebGL2·WebGPU 기반이며 브라우저 에디터가 있습니다(요금제 Free / Personal 월 $15 / Organization 좌석당 월 $50). | [S42][S43][S45] |
| Godot | 최신 4.7(2026-06). 웹 내보내기는 WebGL 2(Compatibility 렌더러)만 지원하고 WebGPU는 미지원입니다. 스레드를 쓰려면 교차 출처 격리가 필요하며, 4.3부터 단일 스레드 내보내기가 가능합니다. **C#(.NET) 프로젝트는 Godot 4에서 웹으로 내보낼 수 없습니다.** | [S47][S48][S49] (D) |
| Unreal | 4.24(2019-12)에서 HTML5 코드가 엔진 본체에서 빠져 커뮤니티 확장으로 넘어갔습니다. Epic의 공식 브라우저 경로는 서버 렌더링을 영상으로 보내는 Pixel Streaming입니다. | [S56][S57][S59] |
| WebGPU 브라우저 지원 | Chrome·Edge 113(2023-05), Chrome Android 121(2024-01), Safari 26(2025-09), Firefox 141(Windows, 2025-07), Firefox 145/147(Apple 실리콘 Mac). web-features 3.40.0(2026-09-24)은 WebGPU를 아직 **Baseline이 아님**으로 분류합니다. WebGL 2는 2024-03부터 "widely available". | [S35][S52][S53][S55] (D) |

## 3. 기준별 비교

| 기준 | 웹(three.js) | Unity 6 | 비고 |
|---|---|---|---|
| 배포·접근성 | URL 하나, 설치 없음, 정적 호스팅이면 충분 | 웹 빌드도 가능하지만 압축 헤더 등 서버 설정이 필요 | 사실(2.1) + [판단] |
| 초기 로딩 | 이 게임 약 0.21 MB(gzip) | 2~11 MB(Brotli, 일화적 측정) | 사실 + [미검증] 범위 |
| 저사양·모바일 웹 | 브라우저 기본 WebGL 2만 사용 | Unity 6부터 공식 지원, 메모리 권장 2 GB | 사실 |
| 제작 도구 | 코드 중심. 에디터·타임라인 없음(직접 구축) | 씬 에디터, 애니메이터, 타임라인, 라이트맵 베이크 | [판단] |
| 캐릭터 애니메이션 | glTF 스키닝은 가능하나 리타깃·블렌딩 도구는 직접 구성 | 휴머노이드 리타깃, 상태 머신 | [판단] |
| 멀티플랫폼 | 웹 우선(PC·모바일 브라우저) | PC·모바일·콘솔 빌드 파이프라인 | [판단] |
| 비용·라이선스 | MIT, 비용 없음 | US$20만 이하 무료, 초과 시 Pro 연 $2,310/석 | 사실(2.2) |
| 벤더 리스크 | 오픈소스, 포크 가능 | 요금 정책 변경 이력(Runtime Fee 발표 후 철회) | 사실 + [판단] |
| 인력 시장 | 웹 개발자 풀은 넓지만 게임 경험자는 적음 | 게임 업계 표준 인력 풀 | [판단] |

## 4. 가중 다기준 평가 (예시)

아래 점수는 필자의 **[판단]**입니다(1~5점). 목표에 따라 가중치를 바꾸면 결론이 뒤집힌다는 점을 보이려고 두 시나리오로 계산했습니다.

| 기준 | 웹 점수 | Unity 점수 | 가중치 A: 프로토타입·웹 공유 | 가중치 B: 상용 출시 |
|---|---|---|---|---|
| 배포·접근성 | 5 | 3 | 25% | 10% |
| 초기 로딩·용량 | 5 | 2.5 | 15% | 5% |
| 제작 도구·생산성 | 3 | 5 | 20% | 25% |
| 아트·애니메이션 파이프라인 | 2 | 5 | 15% | 25% |
| 멀티플랫폼 확장 | 3 | 5 | 10% | 20% |
| 비용·라이선스 리스크 | 5 | 3 | 15% | 15% |
| **가중 합계** | | | **웹 3.95 vs Unity 3.83** | **웹 3.35 vs Unity 4.38** |

해석: 프로토타입 단계에서는 두 선택지가 비슷하고 배포 편의성 때문에 웹이 근소하게 앞섭니다. 상용화 단계에서는 제작 도구와 파이프라인의 비중이 커져 Unity가 확실히 앞섭니다. 가중치를 조정해 민감도를 확인해 보시길 권합니다.

## 5. 이 장르에서 특히 고려할 점

- **원작의 기법.** Alone in the Dark(1992)는 평면 색칠한 폴리곤 캐릭터를 미리 그린 2D 배경 위에 올렸고, 이 조합 때문에 카메라를 고정해야 했습니다 [H1]. 이번 구현은 배경도 실시간 3D로 그리되, 320×240 저해상도·디더링·고정 카메라로 그 인상을 재현했습니다(현재 기본값은 플레이어 추적 카메라이고, 고정 카메라는 설정에서 고릅니다).
- **프리렌더 배경을 쓰려면 Unity가 유리합니다.** [판단] 오프라인 렌더링한 배경과 깊이 버퍼를 합성하는 방식은 웹에서도 가능하지만, 라이트맵·렌더 텍스처·카메라별 베이크 도구를 갖춘 에디터 환경이 작업량을 크게 줄여 줍니다.
- **고정 카메라 전환 로직은 엔진과 무관합니다.** 이 저장소의 `selectCamera`(존 기반 + 히스테리시스)는 Unity에서는 트리거 콜라이더와 가상 카메라 조합으로 거의 그대로 옮겨집니다.
- **추적 카메라는 Unity에 기성품이 있습니다.** 이 저장소의 `FollowCam`(벽 선 2D 광선 + 대리 메시 3D 광선 + 빈 공간 탐색)을 웹에서는 직접 짜야 했지만, Unity에서는 Cinemachine 3의 ThirdPersonFollow(장애물 회피 내장)나 Deoccluder 확장(2.x의 CinemachineCollider가 3.0에서 이름이 바뀜)으로 대체됩니다 [S60][S61]. 화면 기준 조작의 기저 변환(`src/game/controls.ts`)은 몇 줄짜리 벡터 계산이라 C#으로 그대로 옮기면 됩니다.

## 6. Unity로 옮길 때의 이식 경로

| 이 저장소 | Unity 대응 |
|---|---|
| `src/world/rooms/*.ts`의 `cameras`(위치·시선·존 사각형) | 존마다 트리거 콜라이더와 가상 카메라 하나씩, 존 진입 시 우선순위 전환 |
| `src/game/FollowCam.ts`, `src/game/controls.ts`(추적 카메라, 화면 기준 조작) | Cinemachine ThirdPersonFollow 또는 Deoccluder [S60][S61], 입력은 Input System 액션 + 카메라 기준 벡터 변환 |
| `Interactable`(앵커·도달 거리·시야각·핸들러) | 상호작용 컴포넌트 + 플레이어 전방 레이/오버랩 검사 |
| 플래그·인벤토리·`GameState`(JSON) | ScriptableObject/직렬화 세이브 시스템(JSON 형식 그대로 재사용 가능) |
| `src/game/logic.ts`(발전기·모스·금고 상태 머신) | 순수 로직이라 C#로 1:1 포팅 가능, 단위 테스트도 함께 이식 |
| 절차적 텍스처·지오메트리·사운드 | 실제 아트·오디오 에셋으로 교체 |

## 7. 이번 웹 구현의 한계 (솔직한 점검)

- 캐릭터는 스키닝 메시가 아니라 관절 박스 리그를 코드로 움직입니다. 모션 캡처나 키프레임 애니메이션을 넣으려면 glTF 파이프라인이 필요합니다.
- 조명은 실시간 포인트 라이트 6개 풀과 안개로 처리했습니다. 베이크된 GI나 프리렌더 배경은 없습니다.
- 헤드리스 Chromium(SwiftShader)으로 기능·흐름은 전부 자동 검증했지만, **실제 모바일 기기의 프레임률은 측정하지 않았습니다.**
- 사운드는 전부 Web Audio로 합성한 효과음입니다(음성·녹음 음악 없음).

## 출처

- [S1] Unity 6 발표: https://unity.com/blog/unity-6-features-announcement
- [S2] Unity 6 지원 기간: https://unity.com/releases/unity-6/support
- [S3] Unity 6.3 LTS: https://unity.com/blog/unity-6-3-lts-is-now-available
- [S7] Unity 6.6 공지: https://discussions.unity.com/t/unity-6-6-is-now-available/1735357
- [S8] WebGL1 지원 제거: https://discussions.unity.com/t/removing-support-for-gles2-and-webgl1-in-2023-1a/899819
- [S10] WebGPU 실험 공개(6.1): https://discussions.unity.com/t/public-access-to-webgpu-experimental-in-unity-6-1/1572462
- [S11] WebGPU 매뉴얼(6.3): https://docs.unity3d.com/6000.3/Documentation/Manual/WebGPU.html
- [S12] WebGPU 실험 해제(6.6): https://discussions.unity.com/t/webgpu-out-of-experimental-in-unity-6-6/1734694
- [S15] 웹 브라우저 호환성: https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-browsercompatibility.html
- [S16] 웹 기술 개요: https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-technical-overview.html
- [S17] Burst 멀티스레딩(6.4): https://docs.unity3d.com/6000.4/Documentation/Manual/web-multithreading-burst.html
- [S18] 웹 멀티스레딩: https://docs.unity3d.com/6000.7/Documentation/Manual/web-multithreading-intro.html
- [S19] 웹 메모리: https://docs.unity3d.com/Manual/webgl-memory.html
- [S21] Wasm64(6.6): https://docs.unity3d.com/6000.6/Documentation/Manual/wasm-64bit-support.html
- [S22] 웹 오디오: https://docs.unity3d.com/6000.5/Documentation/Manual/webgl-audio.html
- [S24] 웹 네트워킹: https://docs.unity3d.com/Manual/webgl-networking.html
- [S25] 웹 비디오: https://docs.unity3d.com/2023.2/Documentation/Manual/webgl-video.html
- [S26] 웹 배포(압축): https://docs.unity3d.com/Manual/webgl-deploying.html
- [S27] 웹 최적화: https://docs.unity3d.com/6000.3/Documentation/Manual/web-optimization-player.html
- [S28] 빌드 용량 측정(Aras Pranckevičius): https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365
- [S29] Runtime Fee 취소: https://unity.com/blog/unity-is-canceling-the-runtime-fee
- [S30] 요금 변경: https://unity.com/products/pricing-updates
- [S31] 요금제: https://unity.com/products
- [S32] 2026 가격 변경(80.lv): https://80.lv/articles/unity-announces-its-upcoming-2026-price-changes
- [S33] 2026 가격 변경(CG Channel): https://www.cgchannel.com/2025/11/price-of-paid-unity-subscriptions-to-rise-but-free-subs-extended/
- [S34] three.js npm 레지스트리: https://registry.npmjs.org/three
- [S35] MDN browser-compat-data: https://www.npmjs.com/package/@mdn/browser-compat-data
- [S36] three.js r171: https://github.com/mrdoob/three.js/releases/tag/r171
- [S37] three.js WebGPURenderer 매뉴얼: https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html
- [S39] Babylon.js npm: https://www.npmjs.com/package/@babylonjs/core
- [S40] Babylon.js 9.0: https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/
- [S41] Node Material Editor: https://doc.babylonjs.com/features/featuresDeepDive/materials/node_material
- [S42] PlayCanvas npm: https://www.npmjs.com/package/playcanvas
- [S43] PlayCanvas 엔진: https://github.com/playcanvas/engine
- [S45] PlayCanvas 요금제: https://playcanvas.com/plans
- [S47] Godot 릴리스: https://github.com/godotengine/godot/releases
- [S48] Godot 웹 내보내기(4.7 문서): https://github.com/godotengine/godot-docs/blob/4.7/tutorials/export/exporting_for_web.rst
- [S49] Godot 4.3 웹 내보내기: https://godotengine.org/article/progress-report-web-export-in-4-3/
- [S52] WebGPU 구현 현황: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- [S53] Safari 26: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- [S55] web-features: https://www.npmjs.com/package/web-features
- [S56] UE 4.24 릴리스 노트: https://docs.unrealengine.com/en-US/WhatsNew/Builds/ReleaseNotes/4_24/index.html
- [S57] UE 4.24 블로그: https://www.unrealengine.com/en-US/blog/unreal-engine-4-24-released
- [S59] Pixel Streaming 2: https://dev.epicgames.com/documentation/en-us/unreal-engine/pixel-streaming-2-overview-in-unreal-engine
- [S60] Cinemachine 3.0 Third Person Follow 매뉴얼: https://docs.unity3d.com/Packages/com.unity.cinemachine@3.0/manual/CinemachineThirdPersonFollow.html
- [S61] Cinemachine 3.0 변경 기록(CinemachineCollider → CinemachineDeoccluder, 3rdPersonFollow → ThirdPersonFollow): https://docs.unity3d.com/Packages/com.unity.cinemachine@3.0/changelog/CHANGELOG.html
- [H1] Alone in the Dark (1992): https://en.wikipedia.org/wiki/Alone_in_the_Dark_(1992_video_game)
