/* =================================================================================
 * [Final V4]
 * ================================================================================= */

// 로그 제어 시스템
const DEBUG_FLAGS = {
    WIDGET: false,       // 기존 위젯 로그
    WEATHER: true,       // 날씨 관련 로그만 활성화
    DATA: false,         // 데이터 로딩 로그
    CHART: false         // 차트 관련 로그
};

function log(...args) {
    if (DEBUG_FLAGS.WIDGET) {
        console.log("%c[Widget]", "background: #000080; color: #fff", ...args);
    }
}

function logWeather(...args) {
    if (DEBUG_FLAGS.WEATHER) {
        console.log("%c[Weather]", "background: #00C851; color: #fff", ...args);
    }
}

function logData(...args) {
    if (DEBUG_FLAGS.DATA) {
        console.log("%c[Data]", "background: #ff8800; color: #fff", ...args);
    }
}

function error(...args) {
    console.error("%c[Error]", "background: #ff0000; color: #fff", ...args);
}

function errorWeather(...args) {
    console.error("%c[Weather Error]", "background: #CC0000; color: #fff", ...args);
}

const CMD_TEMPLATE = {
    attrSubCmds: [],
    tsSubCmds: [],
    historyCmds: [],
    entityDataCmds: [],
    entityDataUnsubscribeCmds: [],
    alarmDataCmds: [],
    alarmDataUnsubscribeCmds: [],
    entityCountCmds: [],
    entityCountUnsubscribeCmds: [],
};

self.onInit = async function () {
    // 비동기 함수임을 알려주는 예약어 async, 보통 나중에 데이터 로드 작업처럼
    // 비동기처리해야하는 부분 앞에 await 붙여서 씀
    log("🚀 onInit 시작 (V4)");

    // moment.js 한글 로케일 설정
    if (typeof moment !== 'undefined') {
        moment.locale('ko');
    }

    self.ctx.custom = {};
    let { custom } = self.ctx;

    ensureD3(() => { log("✅ D3 로드됨"); });

    // 1. Root Entity 찾기
    defineVariables();

    if (custom.isSample) {
        log("⚠️ Root를 못 찾아 중단합니다.");
        return;
    }

    // 2. 데이터 로딩
    // 1년치 데이터 가져오는 함수, 웹소켓 연결같은 무거운 작업도 있기에 다음줄로 넘어가지 말라는 명시적인 의미로 await 붙임.
    await loadData();

    // 3. 날씨 데이터 로딩 (병렬 처리)
    loadWeatherData();

    // 4. 화면 갱신
    updateData();
};

self.onDestroy = function () {
    let { custom } = self.ctx;
    try {
        if (custom.socket) custom.socket.close();
    } catch (e) {
        error(e);
    }
};

// -----------------------------------------------------------------------------
// [Step 1] 대장(Root Entity) 찾기
// -----------------------------------------------------------------------------
function defineVariables() {
    //이 함수는 **"누구의 데이터를 보여줄 것인가?"**를 결정합니다.
    let { custom } = self.ctx;
    custom.ctx = self.ctx;

    const dataSources = self.ctx.defaultSubscription.configuredDatasources;
    let rootDS = null;

    // 1. 별칭 'root-way' 확인
    rootDS = dataSources.find(ds => 
        (ds.entityAlias && ds.entityAlias.alias === 'root-way') || 
        (ds.name === 'root-way')
    );

    // 2. 없으면 Index 1 (설정상 자산 위치)
    if (!rootDS && dataSources.length > 1) {
        rootDS = dataSources[1];
    }
    // 3. 최후의 수단
    if (!rootDS && dataSources.length > 0) {
        rootDS = dataSources[0];
    }

    if (rootDS && rootDS.entity) {
        custom.ownerDatasource = rootDS;
        custom.rootEntity = rootDS.entity;
        custom.entityType = rootDS.entity.id.entityType; // Entity 타입 저장
        custom.isSample = false;
        log(`✅ 타겟 설정: [${custom.rootEntity.name}] (Type: ${custom.entityType}, ID: ${custom.rootEntity.id.id})`);
    } else {
        custom.isSample = true;
        error("❌ Root Entity 설정 실패");
    }

    custom.latestData = {};     
    custom.timeseriesData = {}; 
}

// -----------------------------------------------------------------------------
// [Step 2] 데이터 로딩
// -----------------------------------------------------------------------------
async function loadData() {
    let { custom } = self.ctx;

    // ★ [중요] 'name' 키 추가 (이름표 확실하게 찾기 위해)
    // tag도 혹시 모르니 TIME_SERIES와 ATTRIBUTE 둘 다 요청
    const KEYS = [
        { type: "TIME_SERIES", key: "totalSavedPower" },
        { type: "TIME_SERIES", key: "totalSavedCO2" },
        { type: "TIME_SERIES", key: "totalTreeCount" },
        { type: "TIME_SERIES", key: "totalSavedCost" },
        { type: "TIME_SERIES", key: "totalOriginPowerUsage" },  // 게이지 계산용
        { type: "TIME_SERIES", key: "totalPowerUsage" },       // 게이지 계산용

        { type: "TIME_SERIES", key: "deviceSavedPower" },
        { type: "TIME_SERIES", key: "savedPower" },
        { type: "TIME_SERIES", key: "powerUsage" },
        { type: "TIME_SERIES", key: "originPowerUsage" },  // 게이지 계산용 추가
        { type: "TIME_SERIES", key: "temperature" },

        // 이름 관련 키 (중복 요청해도 안전함)
        { type: "ATTRIBUTE", key: "name" },
        { type: "ATTRIBUTE", key: "tag" },
        { type: "TIME_SERIES", key: "tag" },

        { type: "ATTRIBUTE", key: "status" },
        { type: "ATTRIBUTE", key: "controlMode" }
    ];

    await loadAllTimeseries();
    subscribeDatas(KEYS);

    // 과거 데이터 + 초기값 로딩 (루트 자산용)
    async function loadAllTimeseries() {
        if (!custom.rootEntity || !custom.rootEntity.id) return;

        const entityType = custom.rootEntity.id.entityType;
        const entityId = custom.rootEntity.id.id;
        const startTs = new Date().getTime() - 86400000 * 365; // 1년치
        const endTS = moment().valueOf();
        
        const targetKeys = ["totalSavedPower", "totalSavedCost", "totalSavedCO2", "totalTreeCount", "totalOriginPowerUsage", "totalPowerUsage"];

        try {
            let tsData = await self.ctx.http.get(
                `/api/plugins/telemetry/${entityType}/${entityId}/values/timeseries?limit=50000&agg=NONE&keys=${targetKeys.join(",")}&startTs=${startTs}&endTs=${endTS}&orderBy=ASC&useStrictDataTypes=true`
            ).toPromise();

            if (!_.isEmpty(tsData)) {
                log(`📊 루트 데이터 수신 완료.`);
                custom.timeseriesData = { 'root': tsData };

                if (!custom.latestData[entityId]) custom.latestData[entityId] = {};
                targetKeys.forEach(key => {
                    if (tsData[key] && tsData[key].length > 0) {
                        const lastItem = tsData[key][tsData[key].length - 1];
                        custom.latestData[entityId][key] = lastItem.value;
                    }
                });
            }
        } catch (e) {
            error("❌ 시계열 요청 실패", e);
        }
    }
    // 웹 소켓 연결하는 부분
    function subscribeDatas(KEYS) {
        let { custom } = self.ctx;
        const TOKEN = window.localStorage.getItem("jwt_token");
        let protocol = window.location.protocol === "https:" ? "wss://" : "ws://";

        if (custom.socket) custom.socket.close();

        custom.socket = new WebSocket(
            `${protocol}${window.location.host}/api/ws/plugins/telemetry?token=${TOKEN}`
        );

        custom.socket.onmessage = function (event) {
            let data = parseJSON(event.data) || {};
            if (data.cmdId == 1) {
                updateLatestData(data, KEYS);
            }
            self.ctx.detectChanges();
        };

        custom.socket.onopen = function (event) {
            log("🔌 WebSocket 연결됨");
            if (!custom.rootEntity || !custom.rootEntity.id) return;

            const entityType = custom.entityType;
            let entityFilter;

            // Entity 타입에 따라 적절한 필터 생성
            if (entityType === 'ENTITY_GROUP') {
                // Device Group인 경우: 그룹 내 엔티티 조회
                log("📂 Entity Group 모드로 데이터 조회");
                entityFilter = {
                    type: "entityGroupList",
                    resolveMultiple: true,
                    groupStateEntity: false,
                    stateEntityParamName: null,
                    defaultStateEntity: null,
                    groupIds: [custom.rootEntity.id.id]
                };
            } else {
                // Device/Asset인 경우: 기존 방식 (관계 기반 조회)
                log("📱 Device/Asset 모드로 데이터 조회");
                entityFilter = {
                    type: "deviceSearchQuery",
                    resolveMultiple: true,
                    rootStateEntity: false,
                    stateEntityParamName: null,
                    defaultStateEntity: null,
                    rootEntity: custom.rootEntity.id,
                    direction: "FROM",
                    maxLevel: 2,
                    fetchLastLevelOnly: false,
                    relationType: "Contains",
                };
            }

            const entityDataCmds = _.cloneDeep(CMD_TEMPLATE);
            entityDataCmds.entityDataCmds = [{
                query: {
                    entityFilter: entityFilter,
                    pageLink: { pageSize: 1024, page: 0, sortOrder: { key: { type: "ENTITY_FIELD", key: "createdTime" }, direction: "ASC" } },
                    entityFields: [
                        { type: "ENTITY_FIELD", key: "name" },
                        { type: "ENTITY_FIELD", key: "label" }
                    ],
                    latestValues: KEYS,
                },
                cmdId: 1,
            }];
            custom.socket.send(JSON.stringify(entityDataCmds));
        };
    }

    function updateLatestData(data, KEYS) {
        if (data.data) {
            log("═══════════════════════════════════════════════════════════");
            log("📥 [초기 데이터 수신] data.data:", JSON.stringify(data.data, null, 2));
            log("═══════════════════════════════════════════════════════════");
            const latestCmd = _.cloneDeep(CMD_TEMPLATE);
            latestCmd.entityDataCmds = [{ cmdId: data.cmdId, latestCmd: { keys: KEYS } }];
            custom.socket.send(JSON.stringify(latestCmd));
            if (data.data.data) processUpdateData(data.data.data, "INITIAL");
            updateData();
        }
        if (data.update) {
            log("═══════════════════════════════════════════════════════════");
            log("🔄 [업데이트 데이터 수신] data.update:", JSON.stringify(data.update, null, 2));
            log("═══════════════════════════════════════════════════════════");
            processUpdateData(data.update, "UPDATE");
            updateData();
        }
    }

    function processUpdateData(items, source = "UNKNOWN") {
        log(`\n🔍 [processUpdateData] 소스: ${source}, 항목 수: ${items.length}`);

        for (let i in items) {
            let targetEntity = items[i].entityId;
            if (!targetEntity || !targetEntity.id) continue;

            const entityId = targetEntity.id;
            const isNew = !custom.latestData[entityId];
            if (isNew) custom.latestData[entityId] = {};

            log(`\n──────────────────────────────────────`);
            log(`📌 [${source}] Entity #${i}: ${entityId} (${isNew ? '신규' : '기존'})`);

            // 현재 저장된 이름 정보
            const prevName = custom.latestData[entityId].name;
            const prevLabel = custom.latestData[entityId].label;
            const prevTag = custom.latestData[entityId].tag;
            log(`   📝 이전 이름정보: name="${prevName}", label="${prevLabel}", tag="${prevTag}"`);

            // Entity Fields 처리 (name, label 등)
            if (items[i].entityFields) {
                log(`   📂 entityFields:`, JSON.stringify(items[i].entityFields));
                for (let key in items[i].entityFields) {
                    const newVal = items[i].entityFields[key].value;
                    const oldVal = custom.latestData[entityId][key];
                    if (oldVal !== newVal) {
                        log(`      ✏️ [entityFields] ${key}: "${oldVal}" → "${newVal}"`);
                    }
                    custom.latestData[entityId][key] = newVal;
                }
            }

            // 데이터 통합 (Time-Series)
            if (items[i].latest && items[i].latest.TIME_SERIES) {
                log(`   📈 TIME_SERIES keys:`, Object.keys(items[i].latest.TIME_SERIES));
                for (let key in items[i].latest.TIME_SERIES) {
                    const newVal = items[i].latest.TIME_SERIES[key].value;
                    const oldVal = custom.latestData[entityId][key];
                    // 이름 관련 키만 상세 로그
                    if (['name', 'label', 'tag'].includes(key) && oldVal !== newVal) {
                        log(`      ⚠️ [TIME_SERIES] ${key}: "${oldVal}" → "${newVal}"`);
                    }
                    custom.latestData[entityId][key] = newVal;
                }
            }
            // 데이터 통합 (Attribute)
            if (items[i].latest && items[i].latest.ATTRIBUTE) {
                log(`   🏷️ ATTRIBUTE keys:`, Object.keys(items[i].latest.ATTRIBUTE));
                for (let key in items[i].latest.ATTRIBUTE) {
                    const newVal = items[i].latest.ATTRIBUTE[key].value;
                    const oldVal = custom.latestData[entityId][key];
                    // 이름 관련 키만 상세 로그
                    if (['name', 'label', 'tag'].includes(key) && oldVal !== newVal) {
                        log(`      ⚠️ [ATTRIBUTE] ${key}: "${oldVal}" → "${newVal}"`);
                    }
                    custom.latestData[entityId][key] = newVal;
                }
            }
            // 데이터 통합 (ENTITY_FIELD - Device Group 응답용)
            if (items[i].latest && items[i].latest.ENTITY_FIELD) {
                log(`   🔖 ENTITY_FIELD keys:`, Object.keys(items[i].latest.ENTITY_FIELD));
                for (let key in items[i].latest.ENTITY_FIELD) {
                    const newVal = items[i].latest.ENTITY_FIELD[key].value;
                    const oldVal = custom.latestData[entityId][key];
                    if (['name', 'label', 'tag'].includes(key) && oldVal !== newVal) {
                        log(`      ⚠️ [ENTITY_FIELD] ${key}: "${oldVal}" → "${newVal}"`);
                    }
                    custom.latestData[entityId][key] = newVal;
                }
            }

            // 최종 이름 정보 출력
            const finalName = custom.latestData[entityId].name;
            const finalLabel = custom.latestData[entityId].label;
            const finalTag = custom.latestData[entityId].tag;
            log(`   ✅ 최종 이름정보: name="${finalName}", label="${finalLabel}", tag="${finalTag}"`);
        }

        log(`\n📊 총 엔티티 수: ${Object.keys(custom.latestData).length}개`);
        log(`📋 전체 latestData 요약:`);
        Object.keys(custom.latestData).forEach(id => {
            const d = custom.latestData[id];
            log(`   - ${id.substring(0,8)}...: name="${d.name}", label="${d.label}", tag="${d.tag}"`);
        });
    }
}

// -----------------------------------------------------------------------------
// [Step 3] 화면 갱신
// -----------------------------------------------------------------------------
function updateData() {
    let { custom } = self.ctx;

    if (_.isEmpty(custom.latestData)) return;

    const rootId = custom.rootEntity?.id?.id;
    
    // [중요 수정] 대장(Root)을 확실하게 걸러내고, "복도"도 걸러냅니다.
    const rootData = (rootId && custom.latestData[rootId]) ? custom.latestData[rootId] : {};

    const deviceIds = Object.keys(custom.latestData).filter(id => {
        // 대장(Root)만 제외 (복도 등은 '기타'로 표시)
        return id !== rootId;
    });

    const devicesData = deviceIds.map(id => ({ id: id, ...custom.latestData[id] }));

    // A. 텍스트 업데이트
    setText('current-date', moment().format('YYYY-MM-DD (ddd) HH:mm:ss') + ' 기준');

    const savedPower = parseFloat(rootData.totalSavedPower || 0);
    const savedCost = parseFloat(rootData.totalSavedCost || 0);
    const savedCo2 = parseFloat(rootData.totalSavedCO2 || 0);
    const treeCount = parseFloat(rootData.totalTreeCount || 0);

    setText('year-saved-power', formatNumber(savedPower, 2) + ' kWh');
    setText('year-saved-cost', formatNumber(savedCost) + '원');
    setText('total-saved-co2', formatNumber(savedCo2, 1) + ' CO₂');
    setText('total-tree-count', formatNumber(treeCount) + '그루');

    // 월간 데이터: 연간 데이터를 12로 나눔
    setText('month-saved-power', formatNumber(savedPower / 12, 2) + ' kWh');
    setText('month-saved-cost', formatNumber(savedCost / 12) + '원');
    setText('month-power-usage', formatNumber(savedPower / 12, 2) + ' kWh');
    setText('month-power-charge', formatNumber(savedCost / 12) + '원');

    // B. 게이지바 (powerUsage / originPowerUsage 비율) - 역산: 100 - percent
    // 각 디바이스의 powerUsage, originPowerUsage 합산
    let sumPowerUsage = parseFloat(rootData.totalPowerUsage || 0);
    let sumOriginPowerUsage = parseFloat(rootData.totalOriginPowerUsage || 0);

    // rootData에 값이 없으면 디바이스들의 합계 사용
    if (sumOriginPowerUsage === 0) {
        devicesData.forEach(device => {
            sumPowerUsage += parseFloat(device.powerUsage || 0);
            sumOriginPowerUsage += parseFloat(device.originPowerUsage || 0);
        });
    }

    let yearPercent = 0;
    if (sumOriginPowerUsage > 0) {
        yearPercent = Math.min(100, Math.round((sumPowerUsage / sumOriginPowerUsage) * 100));
    }
    // 역산: 100 - percent로 게이지 채움
    const invertedPercent = 100 - yearPercent;
    log(`📊 게이지 계산: powerUsage=${sumPowerUsage}, originPowerUsage=${sumOriginPowerUsage}, percent=${yearPercent}% → 역산: ${invertedPercent}%`);
    updateGauge('year', invertedPercent);
    updateGauge('month', invertedPercent);  // 월간도 같은 비율

    // C. 리스트
    renderDistrictList(devicesData);

    // D. 차트
    updateCharts(custom.timeseriesData, devicesData);
}

// -----------------------------------------------------------------------------
// [Step 4] 차트 로직
// -----------------------------------------------------------------------------
function updateCharts(timeseriesData, devices) {
    if (!window.d3) return;

    // A. 라인 차트
    let rawData = [];
    if (timeseriesData && timeseriesData['root']) {
        const rootData = timeseriesData['root'];
        if (rootData['totalSavedPower']) rawData = rootData['totalSavedPower'];
    }

    const lineChartData = processLineChartData(rawData);
    const maxY = lineChartData.length > 0 ? Math.max(...lineChartData.map(d => d.value)) * 1.1 : 100;

    drawLineChart({
        root: document,
        selector: "#line-chart",
        data: lineChartData,
        maxY: maxY
    });

    // B. 바 차트
    const barChartData = processBarChartData(devices);
    const maxX = barChartData.length > 0 ? Math.max(...barChartData.map(d => d.value)) * 1.1 : 100;

    drawBarChart({
        root: document,
        selector: "#bar-chart",
        data: barChartData,
        maxX: maxX
    });
}

function processLineChartData(rawData) {
    const monthlyMap = {};
    for (let i = 1; i <= 12; i++) monthlyMap[`${i}월`] = 0;

    if (rawData && rawData.length > 0) {
        rawData.forEach(point => {
            const date = new Date(point.ts);
            const monthKey = (date.getMonth() + 1) + '월';
            if (parseFloat(point.value) > monthlyMap[monthKey]) {
                monthlyMap[monthKey] = parseFloat(point.value);
            }
        });
    }

    const chartData = Object.keys(monthlyMap).map(key => ({
        month: key,
        value: Math.round(monthlyMap[key])
    }));

    chartData.sort((a, b) => parseInt(a.month) - parseInt(b.month));
    return chartData;
}

function processBarChartData(devices) {
    if (!devices || devices.length === 0) return [];

    const ranking = devices.map(device => {
        // [수정] 이름 찾기 순서: label -> name -> tag (name이 고유하므로 tag보다 우선)
        const label = device.label || device.name || device.tag || 'Unknown';
        
        let val = 0;
        if (device.deviceSavedPower) val = parseFloat(device.deviceSavedPower);
        else if (device.savedPower) val = parseFloat(device.savedPower);
        else if (device.powerUsage) val = parseFloat(device.powerUsage);

        return { label: label, value: val };
    });

    ranking.sort((a, b) => b.value - a.value);
    return ranking.slice(0, 8);
}

// -----------------------------------------------------------------------------
// [Chart Engine] D3 Functions (유지)
// -----------------------------------------------------------------------------
function createSvg({ container, width, height, margin }) {
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const svg = d3.select(container).append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%").style("height", "100%");
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    return { svg, g, innerWidth, innerHeight };
}

function drawLineChart(config) {
    const { root, selector, data, maxY } = config;
    const container = root.querySelector(selector);
    if (!container) return;
    container.innerHTML = "";

    const width = 620;
    const height = 260;
    const margin = { top: 10, right: 16, bottom: 28, left: 54 };
    const { g, innerWidth, innerHeight } = createSvg({ container, width, height, margin });

    const x = d3.scalePoint().domain(data.map(d => d.month)).range([0, innerWidth]).padding(0.45);
    const y = d3.scaleLinear().domain([0, maxY]).range([innerHeight, 0]);

    const yAxis = d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat(d3.format(","));
    g.append("g").attr("class", "y-axis").call(yAxis).select(".domain").remove();

    const xAxis = d3.axisBottom(x).tickSize(-innerHeight);
    g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${innerHeight})`).call(xAxis).select(".domain").remove();
    g.selectAll(".x-axis line").attr("stroke", "#C7C7CC");

    const defs = g.append("defs");
    const gradient = defs.append("linearGradient").attr("id", "line-area-gradient").attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#6f7db1").attr("stop-opacity", 0.45);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#6f7db1").attr("stop-opacity", 0);

    const area = d3.area().x(d => x(d.month)).y0(innerHeight).y1(d => y(d.value)).curve(d3.curveLinear);
    const line = d3.line().x(d => x(d.month)).y(d => y(d.value)).curve(d3.curveLinear);

    g.append("path").datum(data).attr("fill", "url(#line-area-gradient)").attr("d", area);
    g.append("path").datum(data).attr("fill", "none").attr("stroke", "#5466a7").attr("stroke-width", 2.5).attr("d", line);
    g.selectAll(".dot").data(data).enter().append("circle").attr("class", "dot").attr("cx", d => x(d.month)).attr("cy", d => y(d.value)).attr("r", 3).attr("fill", "#5466a7").attr("stroke", "none");
}

function drawBarChart(config) {
    const { root, selector, data, maxX } = config;
    const container = root.querySelector(selector);
    if (!container) return;
    container.innerHTML = "";

    const width = 620;
    const height = 260;
    const margin = { top: 14, right: 24, bottom: 20, left: 96 };
    const { g, innerWidth, innerHeight } = createSvg({ container, width, height, margin });

    const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, innerHeight]).padding(0.45);
    const x = d3.scaleLinear().domain([0, maxX]).range([0, innerWidth]);

    const xAxis = d3.axisBottom(x).ticks(11).tickSize(-innerHeight).tickFormat(d => `${d}`);
    g.append("g").attr("class", "axis x-axis").attr("transform", `translate(0,${innerHeight})`).call(xAxis).select(".domain").attr("stroke", "#e5e7eb");
    g.selectAll(".x-axis line").attr("stroke", "#C7C7CC");
    g.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y).tickSize(0)).selectAll("text").attr("class", "bar-label").attr("dx", "-4");
    g.selectAll(".y-axis path").attr("stroke", "none");
    g.selectAll(".bar").data(data).enter().append("rect").attr("class", "bar").attr("y", d => y(d.label)).attr("x", 0).attr("height", y.bandwidth()).attr("width", d => x(d.value)).attr("fill", "#3f67b1");
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.innerText = value;
    } else {
        // console.warn(`⚠️ ID '${id}' not found`);
    }
}

function formatNumber(num, fixed = 0) {
    if (num === undefined || num === null || isNaN(num)) return '-';
    return Number(num).toLocaleString(undefined, { minimumFractionDigits: fixed, maximumFractionDigits: fixed });
}

function updateGauge(prefix, percent) {
    const bar = document.getElementById(`${prefix}-gauge-bar`);
    const remaining = document.getElementById(`${prefix}-gauge-remaining`);
    const badge = document.getElementById(`${prefix}-gauge-badge`);
    const desc = document.getElementById(`${prefix}-gauge-desc`);
    if (bar) bar.style.flex = percent;
    if (remaining) remaining.style.flex = 100 - percent;
    if (badge) { badge.innerText = `${percent}%`; badge.style.left = `${percent}%`; }
    if (desc) desc.innerText = `예상 사용량 대비 ${percent}%를 달성했어요!`;
}

function renderDistrictList(devices) {
    const container = document.getElementById('district-card-list-container');
    if (!container) return;
    container.innerHTML = '';
    let counts = { normal: 0, warning: 0, danger: 0, etc: 0 };

    devices.forEach(device => {
        const name = device.label || device.name || device.tag || '알 수 없음';
        const temp = device.temperature ? parseFloat(device.temperature).toFixed(1) : '-';
        const rawStatus = device.status || 'unknown';
        const mode = device.controlMode || '수동 제어';

        // 상태 분류: '복도' 등 특수 장비는 'etc'로 분류
        let statusClass = 'normal';
        let statusCategory = 'normal';
        const isEtcDevice = name.includes('복도');

        if (isEtcDevice) {
            statusClass = 'gray';
            statusCategory = 'etc';
            counts.etc++;
        } else if (rawStatus === 'danger' || rawStatus === 'check') {
            statusClass = 'danger';
            statusCategory = 'danger';
            counts.danger++;
        } else if (rawStatus === 'warning') {
            statusClass = 'warning';
            statusCategory = 'warning';
            counts.warning++;
        } else {
            // 기본값: 정상 (normal, unknown, 없음 모두 정상 처리)
            statusClass = 'normal';
            statusCategory = 'normal';
            counts.normal++;
        }

        const cardHtml = `
            <div class="district-card ${statusClass}" data-status="${statusCategory}">
                <div class="dist-card__header">
                    <tp-text class="tp-text title-3 bold">${name}</tp-text>
                    <span class="header-row">
                        <span class="dot"></span>
                        <tp-text class="tp-text footnote bold">${isEtcDevice ? '기타' : getStatusText(rawStatus)}</tp-text>
                    </span>
                </div>
                <div class="dist-card-body">
                    <div class="info-row">
                        <tp-text class="tp-text subheadline regular">현재 온도</tp-text>
                        <tp-text class="tp-text subheadline bold">${temp}°C</tp-text>
                    </div>
                    <div class="info-row">
                        <tp-text class="tp-text subheadline regular">제어 모드</tp-text>
                        <div class="dist-card-color purple">
                            <tp-text class="tp-text caption-2 bold">${mode}</tp-text>
                        </div>
                    </div>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });

    setText('count-normal', `${counts.normal}개 구역`);
    setText('count-warning', `${counts.warning}개 구역`);
    setText('count-danger', `${counts.danger}개 구역`);
    setText('count-etc', `${counts.etc}개 구역`);
    setText('device-status-count', `${counts.normal}/${devices.length}`);
    setText('device-abnormal-count', `(점검필요:${counts.danger})`);

    // 탭 필터 클릭 이벤트 등록 및 상태 적용
    setupStatusFilter(counts);
}

// 현재 선택된 필터 상태 저장 (전역)
let currentFilter = null;
let currentCounts = { normal: 0, warning: 0, danger: 0, etc: 0 };

// 배경색 업데이트 함수 (전역)
function updateContainerBackground(category, hasCards) {
    const container = document.getElementById('district-card-list-container');
    if (!container) return;
    // 모든 배경색 클래스 제거
    container.classList.remove('bg-danger', 'bg-warning', 'bg-normal', 'bg-etc');
    // 카드가 있으면 해당 배경색 추가
    if (hasCards && category) {
        const bgClass = category === 'etc' ? 'bg-etc' : `bg-${category}`;
        container.classList.add(bgClass);
    }
}

function setupStatusFilter(counts) {
    const tabs = document.querySelectorAll('.status-tabs .tab');
    const container = document.getElementById('district-card-list-container');
    if (!tabs.length) return;

    // 전역 counts 업데이트
    currentCounts = { ...counts };

    // 카드가 없는 탭은 disabled 처리 (시각적으로만, 클릭은 가능)
    tabs.forEach(tab => {
        let category = '';
        if (tab.classList.contains('danger')) category = 'danger';
        else if (tab.classList.contains('warning')) category = 'warning';
        else if (tab.classList.contains('normal')) category = 'normal';
        else if (tab.classList.contains('gray')) category = 'etc';

        const count = counts[category] || 0;
        if (count === 0) {
            tab.classList.add('disabled');
        } else {
            tab.classList.remove('disabled');
        }
    });

    // 이전 필터 상태 복원
    if (currentFilter) {
        const cards = document.querySelectorAll('.district-card');
        const activeTab = document.querySelector(`.status-tabs .tab.${currentFilter === 'etc' ? 'gray' : currentFilter}`);
        const hasCards = counts[currentFilter] > 0;

        tabs.forEach(t => t.classList.remove('active'));
        if (activeTab) {
            activeTab.classList.add('active');
        }
        cards.forEach(card => {
            card.style.display = card.dataset.status === currentFilter ? '' : 'none';
        });
        updateContainerBackground(currentFilter, hasCards);
    } else {
        // 필터가 없으면 배경색 제거
        updateContainerBackground(null, false);
    }

    // 이벤트 리스너 등록 (한 번만)
    tabs.forEach(tab => {
        if (tab.dataset.filterBound) return;
        tab.dataset.filterBound = 'true';

        tab.addEventListener('click', function() {
            let category = '';
            if (tab.classList.contains('danger')) category = 'danger';
            else if (tab.classList.contains('warning')) category = 'warning';
            else if (tab.classList.contains('normal')) category = 'normal';
            else if (tab.classList.contains('gray')) category = 'etc';

            const cards = document.querySelectorAll('.district-card');
            const wasActive = tab.classList.contains('active');
            // 전역 counts 사용
            const hasCards = currentCounts[category] > 0;

            document.querySelectorAll('.status-tabs .tab').forEach(t => t.classList.remove('active'));

            if (wasActive) {
                // 이미 활성화된 탭을 다시 클릭하면 필터 해제
                currentFilter = null;
                cards.forEach(card => card.style.display = '');
                updateContainerBackground(null, false);
            } else {
                // 새로운 탭 활성화
                currentFilter = category;
                tab.classList.add('active');
                cards.forEach(card => {
                    card.style.display = card.dataset.status === category ? '' : 'none';
                });
                // 카드가 있으면 배경색 표시, 없으면 빈 배경
                updateContainerBackground(category, hasCards);
            }
        });
    });
}

function getStatusText(status) {
    const map = { 'normal': '정상', 'warning': '운전 활발', 'danger': '점검 필요', 'check': '점검 필요' };
    return map[status] || '정상';
}

function ensureD3(callback) {
    if (window.d3) { callback(); return; }
    const existing = document.querySelector('script[data-d3-loaded]');
    if (existing) { existing.addEventListener('load', () => callback(), { once: true }); return; }
    const script = document.createElement('script');
    script.src = 'https://d3js.org/d3.v7.min.js';
    script.async = true;
    script.dataset.d3Loaded = 'true';
    script.onload = () => callback();
    document.head.appendChild(script);
}

// 날씨 데이터 로딩 함수
function loadWeatherData() {
    logWeather("🌤️ loadWeatherData() 함수 시작");
    const API_KEY = '174c5c33de14b3b6c42d1fccf39fff3f';

    // navigator.geolocation 존재 여부 확인
    logWeather("🔍 navigator.geolocation 체크:", typeof navigator.geolocation);

    // 1. Geolocation API로 현재 위치 가져오기
    if (navigator.geolocation) {
        logWeather("✅ Geolocation API 사용 가능, 현재 위치 요청 중...");

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                logWeather(`📍 현재 위치 성공: 위도 ${lat}, 경도 ${lon}`);
                fetchWeatherData(lat, lon, API_KEY);
            },
            (err) => {
                errorWeather("❌ 위치 정보를 가져올 수 없습니다:", err.message, "| 코드:", err.code);
                // 위치 정보가 없으면 서울의 기본값 사용 (37.5665, 126.9780)
                logWeather("⚠️ 기본 위치(서울)로 날씨 정보를 표시합니다.");
                fetchWeatherData(37.5665, 126.9780, API_KEY);
            },
            {
                timeout: 10000,
                enableHighAccuracy: false,
                maximumAge: 0
            }
        );
    } else {
        errorWeather("❌ 브라우저에서 Geolocation을 지원하지 않습니다.");
        // 기본값으로 서울 사용
        logWeather("⚠️ 기본 위치(서울)로 날씨 정보를 표시합니다.");
        fetchWeatherData(37.5665, 126.9780, API_KEY);
    }

    logWeather("✅ loadWeatherData() 함수 종료");
}

// OpenWeatherMap API 호출
function fetchWeatherData(lat, lon, apiKey) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=ko`;
    logWeather("🌐 OpenWeatherMap API 호출:", url);

    fetch(url)
        .then(response => {
            logWeather("📡 API 응답 수신 - 상태:", response.status, response.statusText);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            logWeather("🌤️ 날씨 데이터 파싱 완료:", JSON.stringify(data, null, 2));
            updateWeatherUI(data);
        })
        .catch(err => {
            errorWeather("❌ 날씨 데이터 요청 실패:", err.message);
            updateWeatherUI(null);
        });
}

// 한국 도시명 영어 → 한글 변환 매핑
const CITY_NAME_MAP = {
    'Seoul': '서울',
    'Busan': '부산',
    'Incheon': '인천',
    'Daegu': '대구',
    'Daejeon': '대전',
    'Gwangju': '광주',
    'Ulsan': '울산',
    'Suwon': '수원',
    'Changwon': '창원',
    'Seongnam': '성남',
    'Goyang': '고양',
    'Yongin': '용인',
    'Bucheon': '부천',
    'Ansan': '안산',
    'Cheongju': '청주',
    'Jeonju': '전주',
    'Anyang': '안양',
    'Pohang': '포항',
    'Gimhae': '김해',
    'Hwaseong': '화성',
    'Jeju': '제주',
    'Cheonan': '천안',
    'Pyeongtaek': '평택'
};

// 날씨 정보를 UI에 업데이트
function updateWeatherUI(weatherData) {
    logWeather("🎨 updateWeatherUI() 함수 시작");

    const locationEl = document.getElementById('weather-location');
    const tempEl = document.getElementById('weather-temp');
    const humidityEl = document.getElementById('weather-humidity');

    logWeather("🔍 DOM 요소 확인:", {
        locationEl: !!locationEl,
        tempEl: !!tempEl,
        humidityEl: !!humidityEl
    });

    if (!weatherData) {
        errorWeather("❌ weatherData가 null입니다. UI에 실패 메시지 표시");
        if (locationEl) locationEl.innerText = '날씨 정보 수신 실패';
        if (tempEl) tempEl.innerText = '-';
        if (humidityEl) humidityEl.innerText = '-';
        return;
    }

    // 지역명 (영어 → 한글 변환)
    const locationNameEn = weatherData.name || '알 수 없음';
    const locationName = CITY_NAME_MAP[locationNameEn] || locationNameEn;

    if (locationEl) {
        locationEl.innerText = locationName;
        logWeather(`✅ 위치 업데이트: ${locationNameEn} → ${locationName}`);
    }

    // 현재 온도 및 체감 온도 (형식: 현재°C / 체감°C)
    const currentTemp = weatherData.main.temp;
    const feelsLike = weatherData.main.feels_like;
    if (tempEl) {
        const tempText = `${Math.round(currentTemp)}°C / ${Math.round(feelsLike)}°C`;
        tempEl.innerText = tempText;
        logWeather(`✅ 온도 업데이트: ${tempText}`);
    }

    // 습도
    const humidity = weatherData.main.humidity;
    if (humidityEl) {
        humidityEl.innerText = `${humidity}%`;
        logWeather(`✅ 습도 업데이트: ${humidity}%`);
    }

    logWeather(`✅ 날씨 UI 업데이트 완료: ${locationName}, ${Math.round(currentTemp)}°C, 습도 ${humidity}%`);
}

function parseJSON(json) {
    try { return JSON.parse(json); } catch (e) { return null; }
}