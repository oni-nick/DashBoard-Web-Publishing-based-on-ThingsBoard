self.onInit = function() {
    // 1. 데이터 준비
    const lineData = [
        { x : 1, y : 18000 }, { x : 2, y : 26000 }, { x : 3, y : 25000 },
        { x : 4, y : 22000 }, { x : 5, y : 17000 }, { x : 6, y : 21000 },
        { x : 7, y : 19000 }, { x : 8, y : 25000 }, { x : 9, y : 40000 },
        { x : 10, y : 45000 }, { x : 11, y : 40000 }, { x : 12, y : 20000 }
    ];

     const barData = [
        {zone : "사무실1", value : 72 }, {zone : "사무실2", value : 69 }, {zone : "사무실3", value : 50 }, 
        {zone : "사무실4", value : 45 }, {zone : "부품창고", value : 27 }, {zone : "휴게실", value : 12 }, 
        {zone : "조립라인1", value : 15 }, {zone : "조립라인2", value : 14 }
        ].sort((a,b) => (b.value - a.value))

    const savingCardData = {
        year: {usage: 12340.99, amount: 1099999, percent: 23},
        month: {usage: 94099, amount: 29999, percent: 7 } 
    };


    //  ****************************** 누적 절감액 카드 ******************************
    const updateSavingCard = (prefix, data, color) => {
        document.getElementById(`${prefix}-usage`).innerHTML = `<strong>${data.usage.toLocaleString()} kW</strong> 만큼 덜 사용해서,`
        document.getElementById(`${prefix}-usage`).innerHTML = `<h4>${data.amount}원</h4><small>을 절약했어요.</small>`
        drawProgressBar(`#gauge-${prefix}`, data.percent, color);
        document.getElementById(`${prefix}-achievement`).textContent = `예상 사용량 대비 ${data.percent}를 달성했어요!`
    }

    //  ****************************** 라인차트 함수 ******************************
    const drawLineChart = () => {
        // 2. 캔버스 설계 (기준 좌표 설정)
    const baseWidth = 800; 
    const baseHeight = 350; // 축 공간 확보를 위해 높이를 조금 늘림
    const margin = { top: 30, right: 30, bottom: 50, left: 70 }; // 하단/좌측 여백 증가

    d3.select("#graph-target").selectAll("*").remove();

    const svg = d3.select("#graph-target")
        .append("svg")
        .attr("viewBox", `0 0 ${baseWidth} ${baseHeight}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%")
        .style("height", "100%");

    // 3. 척도(Scale) 설정
    const xScale = d3.scaleLinear()
        .domain([1, 12])
        .range([margin.left, baseWidth - margin.right]);

    const yScale = d3.scaleLinear()
        .domain([0, 50000]) // Y축 범위를 0 ~ 50,000으로 고정
        .range([baseHeight - margin.bottom, margin.top]);

    // 4. 축(Axis) 요리사 정의
    // X축: 하단에 위치, 12개의 눈금 표시, '월' 붙이기
    const xAxis = d3.axisBottom(xScale)
        .ticks(12)
        .tickFormat(d => d + "월");

    // Y축: 좌측에 위치, 숫자에 콤마(,) 넣기
    const yAxis = d3.axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => d.toLocaleString());

    // 5. 그라데이션 및 요리사(Generator) 준비 (이전과 동일)
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient").attr("id", "area-gradient").attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#3f51b5").attr("stop-opacity", 0.4);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#3f51b5").attr("stop-opacity", 0);

    const lineGen = d3.line().x(d => xScale(d.x)).y(d => yScale(d.y)).curve(d3.curveMonotoneX);
    const areaGen = d3.area().x(d => xScale(d.x)).y0(baseHeight - margin.bottom).y1(d => yScale(d.y)).curve(d3.curveMonotoneX);

    // 6. 실제 그리기 시작
    
    // [추가] X축 그리기
    svg.append("g")
        .attr("transform", `translate(0, ${baseHeight - margin.bottom})`) // 바닥으로 이동
        .call(xAxis)
        .attr("color", "#666"); // 축 색상 조정

    // [추가] Y축 그리기
    svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`) // 왼쪽 여백만큼 이동
        .call(yAxis)
        .attr("color", "#666");

    // 영역(Area) 및 선(Line)
    svg.append("path").datum(lineData).attr("d", areaGen).attr("fill", "url(#area-gradient)");
    svg.append("path").datum(lineData).attr("d", lineGen).attr("fill", "none").attr("stroke", "#3f51b5").attr("stroke-width", 3);

    // 점(Points)
    svg.selectAll(".dot")
        .data(lineData)
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", 5)
        .attr("fill", "#3f51b5")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);
    }
    
    
    
    //  ****************************** 바 차트 함수 ******************************
    const drawBarChart = () => {
    const baseWidth = 400;
    const baseHeight = 320;
    const margin = { top: 20, right: 30, bottom: 20, left: 80 };

        d3.select("#bar-chart-target").selectAll("*").remove();

        const svg = d3.select("#bar-chart-target")
            .append("svg")
            .attr("viewBox", `0 0 ${baseWidth} ${baseHeight}`)
            .style("width", "100%")
            .style("height", "100%")

        
    // 3. 척도(Scale) 설정
    // Y축: 범주형 데이터(구역 이름)를 위아래로 배치
    const yScale = d3.scaleBand()
        .domain(barData.map(d => d.zone))
        .range([margin.top, baseHeight - margin.bottom])
        .padding(0.2); // 막대 사이의 간격

    // X축: 데이터 값(숫자)을 가로 너비로 변환
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(barData, d => d.value)])
        .range([margin.left, baseWidth - margin.right]);

    // 4. 막대(Bar) 그리기
    svg.selectAll(".bar")
        .data(barData)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("y", d => yScale(d.zone))       // 위아래 위치
        .attr("x", margin.left)               // 시작점 (왼쪽 여백)
        .attr("width", d => xScale(d.value) - margin.left) // 막대 너비
        .attr("height", yScale.bandwidth())   // 막대 두께 (자동 계산)
        .attr("fill", "#5c6bc0")              // 막대 색상
        .attr("rx", 4);                       // 모서리 둥글게

    // 5. 축(Axis) 그리기
    // 왼쪽 축: 구역 이름 표시
    svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale).tickSize(0)) // 눈금선 제거
        .select(".domain").remove(); // 축 선 제거 (깔끔하게)

    // 6. 텍스트 라벨 추가 (막대 끝에 숫자 표시)
    svg.selectAll(".label")
        .data(barData)
        .enter()
        .append("text")
        .attr("x", d => xScale(d.value) + 5)
        .attr("y", d => yScale(d.zone) + yScale.bandwidth() / 2 + 5)
        .text(d => d.value.toLocaleString())
        .style("font-size", "12px")
        .style("fill", "#666");
    }

// //  ****************************** ProgressBar 그리는 함수 ******************************
    const drawProgressBar = (selector, percent, color) => {
        const width = 300;
        const height = 15; // 바의 높이
        
        // 기존에 그려진게 있다면 삭제 (중복 방지)
        d3.select(selector).selectAll("*").remove();

        const svg = d3.select(selector)
            .append("svg")
            .attr("viewBox", `0 0 ${width} 40`) // 배지가 위로 튀어나오므로 높이 여유를 줌
            .style("width", "100%")
            .style("height", "auto")
            .style("overflow", "visible");

        // 배경 회색 바
        svg.append("rect")
            .attr("width", width)
            .attr("height", height)
            .attr("rx", height / 2)
            .attr("fill", "#eee");

        // 실제 진행 바
        const progress = svg.append("rect")
            .attr("width", 0)
            .attr("height", height)
            .attr("rx", height / 2)
            .attr("fill", color);

        // 검은색 퍼센트 배지 그룹
        const badge = svg.append("g")
            .attr("transform", `translate(0, 0)`);

        badge.append("rect")
            .attr("width", 40)
            .attr("height", 20)
            .attr("rx", 10)
            .attr("y", -25)
            .attr("x", -20)
            .attr("fill", "#333");

        badge.append("text")
            .attr("text-anchor", "middle")
            .attr("y", -11)
            .style("fill", "white")
            .style("font-size", "11px")
            .text(`${percent}%`);

        // 애니메이션 실행
        const targetWidth = width * (percent / 100);
        
        progress.transition().duration(1000).attr("width", targetWidth);
        badge.transition().duration(1000).attr("transform", `translate(${targetWidth}, 0)`);
    };



    // 차트 그리는 함수 호출
    
    updateSavingCard('year', savingCardData.year, "#4caf50");
    updateSavingCard('month', savingCardData.month, "#ff9800");

    drawLineChart();
    drawBarChart();


}