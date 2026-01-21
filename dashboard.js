/* =================================================================================
 * [Final V4] 
 * ================================================================================= */

function log(...args) {
    console.log("%c[Widget]", "background: #000080; color: #fff", ...args);
}
function error(...args) {
    console.error("%c[Error]", "background: #ff0000; color: #fff", ...args);
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

    // 3. 화면 갱신
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
        custom.isSample = false;
        log(`✅ 타겟 설정: [${custom.rootEntity.name}] (ID: ${custom.rootEntity.id.id})`);
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
        
        { type: "TIME_SERIES", key: "deviceSavedPower" }, 
        { type: "TIME_SERIES", key: "savedPower" },       
        { type: "TIME_SERIES", key: "powerUsage" },
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
        
        const targetKeys = ["totalSavedPower", "totalSavedCost", "totalSavedCO2", "totalTreeCount"];

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

            const entityDataCmds = _.cloneDeep(CMD_TEMPLATE);
            entityDataCmds.entityDataCmds = [{
                query: {
                    entityFilter: {
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
                    },
                    pageLink: { pageSize: 1024, page: 0, sortOrder: { key: { type: "ENTITY_FIELD", key: "createdTime" }, direction: "ASC" } },
                    entityFields: [],
                    latestValues: KEYS,
                },
                cmdId: 1,
            }];
            custom.socket.send(JSON.stringify(entityDataCmds));
        };
    }

    function updateLatestData(data, KEYS) {
        if (data.data) {
            const latestCmd = _.cloneDeep(CMD_TEMPLATE);
            latestCmd.entityDataCmds = [{ cmdId: data.cmdId, latestCmd: { keys: KEYS } }];
            custom.socket.send(JSON.stringify(latestCmd));
            if (data.data.data) processUpdateData(data.data.data);
            updateData();
        }
        if (data.update) {
            processUpdateData(data.update);
            updateData();
        }
    }

    function processUpdateData(items) {
        for (let i in items) {
            let targetEntity = items[i].entityId;
            if (!targetEntity || !targetEntity.id) continue;

            if (!custom.latestData[targetEntity.id]) custom.latestData[targetEntity.id] = {};

            // 데이터 통합 (Time-Series)
            if (items[i].latest && items[i].latest.TIME_SERIES) {
                for (let key in items[i].latest.TIME_SERIES) {
                    custom.latestData[targetEntity.id][key] = items[i].latest.TIME_SERIES[key].value;
                }
            }
            // 데이터 통합 (Attribute)
            if (items[i].latest && items[i].latest.ATTRIBUTE) {
                for (let key in items[i].latest.ATTRIBUTE) {
                    custom.latestData[targetEntity.id][key] = items[i].latest.ATTRIBUTE[key].value;
                }
            }
        }
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
        // 1. 대장(Root) 제외
        if (id === rootId) return false;
        
        // 2. "복도" 이름 제외
        const device = custom.latestData[id];
        const name = device.tag || device.name || '';
        if (name.includes('복도')) return false;

        return true;
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

    // (임시) 월간 데이터
    setText('month-saved-power', formatNumber(savedPower * 0.1, 2) + ' kWh');
    setText('month-saved-cost', formatNumber(savedCost * 0.1) + '원');
    setText('month-power-usage', formatNumber(savedPower * 0.1, 2) + ' kWh');
    setText('month-power-charge', formatNumber(savedCost * 0.1) + '원');

    // B. 게이지바
    const targetPower = 50000;
    const percent = Math.min(100, Math.round((savedPower) * 100));
    updateGauge('year', percent);
    updateGauge('month', Math.round(percent / 3));

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
        // [중요] 이름 찾기 순서: tag -> name -> ID
        const label = device.tag || device.name || 'Unknown';
        
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
    const badge = document.getElementById(`${prefix}-gauge-badge`);
    const desc = document.getElementById(`${prefix}-gauge-desc`);
    if (bar) bar.style.flex = percent;
    if (badge) { badge.innerText = `${percent}%`; badge.style.left = `${percent}%`; }
    if (desc) desc.innerText = `예상 사용량 대비 ${percent}%를 달성했어요!`;
}

function renderDistrictList(devices) {
    const container = document.getElementById('district-card-list-container');
    if (!container) return;
    container.innerHTML = '';
    let counts = { normal: 0, warning: 0, danger: 0, etc: 0 };
    
    devices.forEach(device => {
        const name = device.tag || device.name || '알 수 없음';
        const temp = device.temperature ? parseFloat(device.temperature).toFixed(1) : '-';
        const rawStatus = device.status || 'unknown';
        const mode = device.controlMode || '수동 제어';

        let statusClass = 'gray';
        if (rawStatus === 'normal') { statusClass = 'normal'; counts.normal++; }
        else if (rawStatus === 'warning') { statusClass = 'warning'; counts.warning++; }
        else if (rawStatus === 'danger' || rawStatus === 'check') { statusClass = 'danger'; counts.danger++; }
        else { counts.etc++; }

        const cardHtml = `
            <div class="district-card ${statusClass}">
                <div class="dist-card__header">
                    <tp-text class="tp-text title-3 bold">${name}</tp-text>
                    <span class="header-row">
                        <span class="dot"></span>
                        <tp-text class="tp-text footnote bold">${getStatusText(rawStatus)}</tp-text>
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
}

function getStatusText(status) {
    const map = { 'normal': '정상', 'warning': '운전 활발', 'danger': '점검 필요', 'check': '점검 필요' };
    return map[status] || '기타';
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

function parseJSON(json) {
    try { return JSON.parse(json); } catch (e) { return null; }
}