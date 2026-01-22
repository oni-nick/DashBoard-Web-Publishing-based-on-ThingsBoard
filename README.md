# IoT Energy Management Dashboard (ThingsBoard Widget)

![Project Status](https://img.shields.io/badge/Status-Active-success)
![ThingsBoard](https://img.shields.io/badge/Platform-ThingsBoard-blue)
![Tech](https://img.shields.io/badge/Stack-HTML%2FSCSS%2FJS-yellow)
![Viz](https://img.shields.io/badge/Visualization-D3.js-orange)

> **"Figma 디자인을 살아 숨 쉬는 IoT 대시보드로."** > 인턴십 과정에서 진행된 3주간의 웹 퍼블리싱 및 데이터 시각화 프로젝트입니다. 정적인 디자인 시안을 바탕으로 실제 ThingsBoard 데이터를 연동하여 실시간 에너지 절감 현황을 모니터링하는 커스텀 위젯을 개발했습니다.

---

## Project Journey (2~3 Weeks)

이 프로젝트는 단순한 코딩이 아닌, **디자인에서 실제 서비스로 이어지는 단계적 고도화 과정**을 거쳤습니다.

### **Phase 1: Web Publishing & UI Implementation**
- **Goal**: 디자이너가 작업한 **Figma** 시안을 픽셀 퍼펙트(Pixel-perfect)하게 웹으로 구현.
- **Action**:
  - Semantic HTML 구조 설계.
  - SCSS를 활용한 반응형 레이아웃 및 스타일링.
  - 정적(Static) 데이터를 활용한 UI 프로토타입 완성.

### **Phase 2: Data Integration (ThingsBoard API & WebSocket)**
- **Goal**: 정적이었던 화면에 **실제 IoT 데이터** 생명을 불어넣기.
- **Action**:
  - **WebSocket**을 통한 실시간 텔레메트리(Telemetry) 데이터 구독.
  - HTTP API를 활용한 과거 시계열 데이터(Timeseries) 비동기(`async/await`) 로딩.
  - 복잡한 센서 데이터 구조 파싱 및 에러 핸들링 (Lodash, Try-Catch 활용).

### **Phase 3: Visualization & Data Binding**
- **Goal**: 데이터를 직관적인 정보로 변환하고 사용자 경험(UX) 개선.
- **Action**:
  - **D3.js**를 활용한 동적 데이터 시각화 (막대 차트, 라인 차트).
  - 사무실(1~4) 및 조립라인(1~2) 데이터 분리 로직 구현.
  - **Loading State(스피너/스켈레톤)** 구현으로 초기 렌더링 깜빡임 현상 해결.
  - 게이지 바 및 뱃지(Badge) 동적 위치 바인딩.

---

## 🛠 Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Core** | ![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black) ![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![SCSS](https://img.shields.io/badge/SCSS-CC6699?logo=sass&logoColor=white) |
| **IoT Platform** | **ThingsBoard** (Custom Widget API, WebSocket) |
| **Visualization** | **D3.js (v7)** (Dynamic SVG Charts) |
| **Library** | **Lodash** (Data processing), **Moment.js** (Date formatting) |
| **Tools** | **Git/GitHub** (Version Control), **VS Code** |

---

## File Structure

ThingsBoard 위젯 개발 환경에 맞춰 로직(JS), 스타일(CSS), 구조(HTML)가 분리되어 있습니다.

```bash
DashBoard-Web-Publishing-based-on-ThingsBoard
 ┣ dashboard.html      # 위젯의 뼈대 (HTML Structure)
 ┣ dashboard.js        # 데이터 로딩, 가공, D3 렌더링 로직 (Controller)
 ┣ dashboard.scss      # UI 스타일링 및 애니메이션 (Styles)
 ┣ _global_styles.scss # 공통 변수 및 믹스인
 ┗ README.md           # 프로젝트 문서