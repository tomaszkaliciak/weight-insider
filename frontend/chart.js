const movingAverageWindow = 7; // Days for SMA and Std Dev
const stdDevMultiplier = 1; // How many std devs for the band (1 = ~68%, 1.96 = ~95%)
const dataFile = "data.json";

async function loadData() {
  try {
    const response = await fetch(dataFile);
    const jsonData = await response.json();

    const weights = jsonData.weights;
    const rawData = Object.entries(weights).map(([date, value]) => ({
      date: new Date(date),
      value: value,
    }));

    rawData.sort((a, b) => a.date - b.date);

    return rawData;
  } catch (error) {
    console.error("Error loading data:", error);
    return null;
  }
}

function calculateMovingStats(data, windowSize) {
  return data.map((d, i, arr) => {
    const windowData = arr.slice(Math.max(0, i - windowSize + 1), i + 1);
    const values = windowData.map((item) => item.value);

    if (values.length < windowSize && i < windowSize - 1) {
      return {
        ...d,
        sma: null,
        stdDev: null,
        lowerBound: null,
        upperBound: null,
      };
    }

    const sum = values.reduce((acc, val) => acc + val, 0);
    const sma = sum / values.length;

    const variance =
      values.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    const lowerBound = sma - stdDevMultiplier * stdDev;
    const upperBound = sma + stdDevMultiplier * stdDev;

    return { ...d, sma, stdDev, lowerBound, upperBound };
  });
}

function calculateTrendWeight(startDate, initialWeight, weeklyIncrease, date) {
  const millisecondsInWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = (date - startDate) / millisecondsInWeek;

  if (weeksSinceStart < 0) {
    return null;
  }

  return initialWeight + weeksSinceStart * weeklyIncrease;
}

async function createChart() {
  const rawData = await loadData();

  if (!rawData) {
    console.error("No data loaded, chart cannot be created.");
    return;
  }

  const processedData = calculateMovingStats(rawData, movingAverageWindow);
  const validProcessedData = processedData.filter((d) => d.sma !== null);

  const margin = { top: 20, right: 30, bottom: 50, left: 50 };
  let width = 800 - margin.left - margin.right;
  let height = 400 - margin.top - margin.bottom;

  const svg = d3
    .select("#chart-container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  let xScale = d3
    .scaleTime()
    .domain(d3.extent(processedData, (d) => d.date))
    .range([0, width]);

  const yMin =
    d3.min(processedData, (d) => Math.min(d.value, d.lowerBound ?? d.value)) -
    0.2;
  const yMax =
    d3.max(processedData, (d) => Math.max(d.value, d.upperBound ?? d.value)) +
    0.2;

  let yScale = d3.scaleLinear().domain([yMin, yMax]).nice().range([height, 0]);

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(d3.timeDay.every(7))
    .tickFormat(d3.timeFormat("%d %b"));

  const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".2f"));

  let xAxisGroup = svg
    .append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${height})`);

  let yAxisGroup = svg.append("g").attr("class", "axis y-axis");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - height / 2)
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .text("Weight (KG)");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", `translate(${width / 2}, ${height + margin.top + 30})`)
    .style("text-anchor", "middle")
    .text("Date");

  let gridGroup = svg.append("g").attr("class", "grid");

  const areaGenerator = d3
    .area()
    .x((d) => xScale(d.date))
    .y0((d) => yScale(d.lowerBound))
    .y1((d) => yScale(d.upperBound));

  const lineGenerator = d3
    .line()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.sma));

  const trendStartDate = new Date("2025-03-04");
  const trendInitialWeight =
    validProcessedData.find((d) => d.date >= trendStartDate)?.value ||
    validProcessedData[0].value;
  const trendWeeklyIncrease = 0.3;

  const trendData = validProcessedData.map((d) => {
    const trendWeight = calculateTrendWeight(
      trendStartDate,
      trendInitialWeight,
      trendWeeklyIncrease,
      d.date,
    );
    return {
      date: d.date,
      trendWeight: trendWeight === null ? null : trendWeight,
    };
  });

  const trendWeeklyIncrease_2 = 0.2;

  const trendData_2 = validProcessedData.map((d) => {
    const trendWeight = calculateTrendWeight(
      trendStartDate,
      trendInitialWeight,
      trendWeeklyIncrease_2,
      d.date,
    );
    return {
      date: d.date,
      trendWeight: trendWeight === null ? null : trendWeight,
    };
  });

  const trendLineGenerator = d3
    .line()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.trendWeight))
    .defined((d) => d.trendWeight !== null);

  const trendLineGenerator_2 = d3
    .line()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.trendWeight))
    .defined((d) => d.trendWeight !== null);

  let areaPath = svg.append("path").attr("class", "area");

  let linePath = svg.append("path").attr("class", "line");

  let trendPath = svg
    .append("path")
    .attr("class", "trend-line")
    .style("stroke", "green")
    .style("stroke-width", 2)
    .style("fill", "none")
    .on("mouseover", function (event, d) {
      d3.select("#tooltip")
        .html(
          `Date: ${d3.timeFormat("%Y-%m-%d")(d.date)}<br>Weight: ${d.trendWeight.toFixed(2)}`,
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");

      d3.select("#tooltip").transition().duration(200).style("opacity", 0.9);
    })
    .on("mouseout", function (event, d) {
      d3.select("#tooltip").transition().duration(500).style("opacity", 0);
    });

  let trendPath_2 = svg
    .append("path")
    .attr("class", "trend-line")
    .style("stroke", "red")
    .style("stroke-width", 2)
    .style("fill", "none")
    .on("mouseover", function (event, d) {
      d3.select("#tooltip")
        .html(
          `Date: ${d3.timeFormat("%Y-%m-%d")(d.date)}<br>Weight: ${d.trendWeight.toFixed(2)}`,
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");

      d3.select("#tooltip").transition().duration(200).style("opacity", 0.9);
    })
    .on("mouseout", function (event, d) {
      d3.select("#tooltip").transition().duration(500).style("opacity", 0);
    });

  let dot = svg
    .selectAll(".dot")
    .data(validProcessedData)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", (d) => xScale(d.date))
    .attr("cy", (d) => yScale(d.value))
    .attr("r", 3)
    .attr("fill", "steelblue")
    .attr("opacity", 0.7)
    .on("mouseover", function (event, d) {
      d3.select("#tooltip")
        .html(
          `Date: ${d3.timeFormat("%Y-%m-%d")(d.date)}<br>Weight: ${d.value.toFixed(2)}`,
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");

      d3.select("#tooltip").transition().duration(200).style("opacity", 0.9);
    })
    .on("mouseout", function (event, d) {
      d3.select("#tooltip").transition().duration(500).style("opacity", 0);
    });
  const zoom = d3
    .zoom()
    .scaleExtent([1, 20])
    .translateExtent([
      [0, 0],
      [width, height],
    ])
    .on("zoom", zoomed);

  svg
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .lower()
    .call(zoom);

  function updateChart() {
    xAxisGroup
      .call(xAxis)
      .selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)");

    yAxisGroup.call(yAxis);

    gridGroup.call(d3.axisLeft(yScale).tickSize(-width).tickFormat(""));

    areaPath.datum(validProcessedData).attr("d", areaGenerator);

    linePath.datum(validProcessedData).attr("d", lineGenerator);

    trendPath.datum(trendData).attr("d", trendLineGenerator);

    trendPath_2.datum(trendData_2).attr("d", trendLineGenerator_2);
  }

  function zoomed(event) {
    const transform = event.transform;

    const newXScale = transform.rescaleX(xScale);
    const newYScale = transform.rescaleY(yScale);

    xAxisGroup
      .call(xAxis.scale(newXScale))
      .selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)");

    yAxisGroup.call(yAxis.scale(newYScale));

    gridGroup.call(d3.axisLeft(newYScale).tickSize(-width).tickFormat(""));

    areaPath.attr(
      "d",
      areaGenerator
        .x((d) => newXScale(d.date))
        .y0((d) => newYScale(d.lowerBound))
        .y1((d) => newYScale(d.upperBound)),
    );
    linePath.attr(
      "d",
      lineGenerator.x((d) => newXScale(d.date)).y((d) => newYScale(d.sma)),
    );

    trendLineGenerator
      .x((d) => newXScale(d.date))
      .y((d) => newYScale(d.trendWeight));
    trendLineGenerator_2
      .x((d) => newXScale(d.date))
      .y((d) => newYScale(d.trendWeight));

    dot
      .attr("cx", (d) => newXScale(d.date))
      .attr("cy", (d) => newYScale(d.value));

    updateChart();
  }

  updateChart();

  console.log("Chart rendered. Data used:", processedData);
}

createChart();
