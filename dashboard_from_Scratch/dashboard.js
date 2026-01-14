// 대시보드에 사용될 JSON 데이터 정의
const dashboardData = {
  lineChart: {
    maxY: 50000,
    points: [
      { month: "1월", value: 18000 },
      { month: "2월", value: 27000 },
      { month: "3월", value: 25000 },
      { month: "4월", value: 22000 },
      { month: "5월", value: 19000 },
      { month: "6월", value: 23000 },
      { month: "7월", value: 21000 },
      { month: "8월", value: 28000 },
      { month: "9월", value: 42000 },
      { month: "10월", value: 47000 },
      { month: "11월", value: 43000 },
      { month: "12월", value: 26000 }
    ]
  },
  barChart: {
    maxX: 110,
    items: [
      { label: "사무실 1", value: 77 },
      { label: "사무실 2", value: 68 },
      { label: "사무실 3", value: 49 },
      { label: "사무실 4", value: 44 },
      { label: "부품 창고", value: 26 },
      { label: "조립 라인 1", value: 15 },
      { label: "조립 라인 2", value: 13 },
      { label: "휴게실", value: 12 }
    ]
  }
};

// 공통 SVG 생성 유틸
function createSvg({ container, width, height, margin }) {
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  return { svg, g, innerWidth, innerHeight };
}

// 라인 차트 그리기
function drawLineChart(config) {
  const { root, selector, data, maxY } = config;
  const container = root.querySelector(selector);
  if (!container) return;

  container.innerHTML = "";

  const width = 620;
  const height = 260;
  const margin = { top: 10, right: 16, bottom: 28, left: 54 };

  const { g, innerWidth, innerHeight } = createSvg({
    container,
    width,
    height,
    margin
  });

  const x = d3
    .scalePoint()
    .domain(data.map(d => d.month))
    .range([0, innerWidth])
    .padding(0.45);

  const y = d3
    .scaleLinear()
    .domain([0, maxY])
    // .nice()
    .range([innerHeight, 0]);

  // Y축 (가로선 제거, 숫자 라벨만 유지)
  const yAxis = d3
    .axisLeft(y)
    .ticks(5)
    .tickSize(0) // 가로 실선 제거
    .tickPadding(8)
    .tickFormat(d3.format(","));

  g.append("g")
    .attr("class", "y-axis")
    .call(yAxis)
    .select(".domain")
    .remove();

  // X축 (세로 실선 유지)
  const xAxis = d3.axisBottom(x)
    .tickSize(-innerHeight); // 세로 실선 생성

  g.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .select(".domain")
    .remove();

  // 세로 실선 색상 설정
  g.selectAll(".x-axis line")
    .attr("stroke", "#C7C7CC");

  // 영역 그라데이션 정의
  const defs = g.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", "line-area-gradient")
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "0%")
    .attr("y2", "100%");

  gradient
    .append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "#6f7db1")
    .attr("stop-opacity", 0.45);

  gradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#6f7db1")
    .attr("stop-opacity", 0);

  const area = d3
    .area()
    .x(d => x(d.month))
    .y0(innerHeight)
    .y1(d => y(d.value))
    .curve(d3.curveLinear);

  const line = d3
    .line()
    .x(d => x(d.month))
    .y(d => y(d.value))
    .curve(d3.curveLinear);

  g.append("path")
    .datum(data)
    .attr("fill", "url(#line-area-gradient)")
    .attr("d", area);

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#5466a7")
    .attr("stroke-width", 2.5)
    .attr("d", line);

  g.selectAll(".dot")
    .data(data)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", d => x(d.month))
    .attr("cy", d => y(d.value))
    .attr("r", 3)
    .attr("fill", "#5466a7")
    .attr("stroke", "none");
}

// 가로 막대 차트 그리기
function drawBarChart(config) {
  const { root, selector, data, maxX } = config;
  const container = root.querySelector(selector);
  if (!container) return;

  container.innerHTML = "";

  const width = 620;
  const height = 260;
  const margin = { top: 14, right: 24, bottom: 20, left: 96 };

  const { g, innerWidth, innerHeight } = createSvg({
    container,
    width,
    height,
    margin
  });

  const y = d3
    .scaleBand()
    .domain(data.map(d => d.label))
    .range([0, innerHeight])
    .padding(0.45);

  const x = d3
    .scaleLinear()
    .domain([0, maxX])
    // .nice()
    .range([0, innerWidth]);

  // X축 (세로 실선 유지, 가로 바닥선은 유지)
  const xAxis = d3
    .axisBottom(x)
    .ticks(11)
    .tickSize(-innerHeight)
    .tickFormat(d => `${d}`);

  g.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis)
    .select(".domain")
    .attr("stroke", "#e5e7eb");

  // 세로 실선 색상 설정
  g.selectAll(".x-axis line")
    .attr("stroke", "#C7C7CC");

  // Y축 (라벨만 표시)
  g.append("g")
    .attr("class", "axis y-axis")
    .call(d3.axisLeft(y).tickSize(0))
    .selectAll("text")
    .attr("class", "bar-label")
    .attr("dx", "-4");

  g.selectAll(".y-axis path").attr("stroke", "none");

  g.selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("y", d => y(d.label))
    .attr("x", 0)
    .attr("height", y.bandwidth())
    .attr("width", d => x(d.value))
    .attr("fill", "#3f67b1");
}

// d3 로딩 보장 유틸
function ensureD3(callback) {
  if (window.d3) {
    callback(); 
    return;
  }
  const existing = document.querySelector('script[data-d3-loaded]');
  if (existing) {
    existing.addEventListener('load', () => callback(), { once: true });
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://d3js.org/d3.v7.min.js';
  script.async = true;
  script.dataset.d3Loaded = 'true';
  script.onload = () => callback();
  document.head.appendChild(script);
}

// 공통 초기화 함수 (root: document 또는 ThingsBoard 컨테이너)
function initCharts(rootElement) {
  drawLineChart({
    root: rootElement,
    selector: "#line-chart",
    data: dashboardData.lineChart.points,
    maxY: dashboardData.lineChart.maxY
  });

  drawBarChart({
    root: rootElement,
    selector: "#bar-chart",
    data: dashboardData.barChart.items,
    maxX: dashboardData.barChart.maxX
  });
}

// ThingsBoard 위젯 환경: self.onInit 사용
if (typeof self !== 'undefined') {
  self.onInit = function () {
    const root = (self.ctx && self.ctx.$container && self.ctx.$container[0]) || document;
    ensureD3(() => initCharts(root));
  };
}

// 일반 브라우저에서 단독 HTML로 사용할 때도 동작하도록 처리
if (typeof window !== 'undefined' && !(typeof self !== 'undefined' && self.ctx)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureD3(() => initCharts(document));
    });
  } else {
    ensureD3(() => initCharts(document));
  }
}