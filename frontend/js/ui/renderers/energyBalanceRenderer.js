// js/ui/renderers/energyBalanceRenderer.js
// Visualizes Energy Balance (Intake vs TDEE) as a diverging bar chart

import * as d3 from 'd3';
import { StateManager } from '../../core/stateManager.js';
import * as Selectors from '../../core/selectors.js';
import { Utils } from '../../core/utils.js';
import { CONFIG } from '../../config.js';

export const EnergyBalanceRenderer = {
  _container: null,
  _lastData: null,
  _colors: null,
  _resizeObserver: null,

  init() {
    this._container = document.getElementById('energy-balance-content');
    if (!this._container) {
      console.warn('[EnergyBalanceRenderer] Container not found.');
      return;
    }

    this._resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0 && this._lastData) {
          requestAnimationFrame(() => this._renderChart(this._lastData, this._colors));
        }
      }
    });
    this._resizeObserver.observe(this._container);

    StateManager.subscribeToSpecificEvent('state:displayStatsUpdated', () => this._render());
    StateManager.subscribeToSpecificEvent('state:filteredDataChanged', () => this._render());

    const s = StateManager.getState();
    if (s.isInitialized) this._render();
  },

  /**
   * Returns goal-aware bar colors.
   * Cutting: deficit good, surplus bad. Bulking: surplus good, deficit bad.
   * Neutral fallback when no goal direction is clear.
   * @param {object} goal - The goal object from state.
   * @returns {{ surplusColor: string, deficitColor: string }}
   */
  _getGoalAwareColors(goal) {
    if (goal?.targetRate != null && goal.targetRate < 0) {
      return { surplusColor: 'var(--danger-color)', deficitColor: 'var(--success-color)' };
    }
    if (goal?.targetRate != null && goal.targetRate > 0) {
      return { surplusColor: 'var(--success-color)', deficitColor: 'var(--danger-color)' };
    }
    return { surplusColor: 'var(--warning-color, #f59e0b)', deficitColor: 'var(--primary-color)' };
  },

  _render() {
    const state = StateManager.getState();
    const data = Selectors.selectFilteredData(state);

    if (!data || data.length < 7) {
      this._renderNoData();
      return;
    }

    const balanceData = data.map(d => {
      if (d.calorieIntake == null || isNaN(d.calorieIntake)) return null;
      const tdee = d.adaptiveTDEE || d.googleFitTDEE;
      if (tdee == null || isNaN(tdee)) return null;
      return { date: d.date, balance: d.calorieIntake - tdee, intake: d.calorieIntake, tdee: tdee };
    }).filter(d => d != null);

    if (balanceData.length < 3) {
      this._renderNoData();
      return;
    }

    this._lastData = balanceData;

    try {
      const goal = Selectors.selectGoal(state);
      this._colors = this._getGoalAwareColors(goal);
    } catch (e) {
      console.warn('[EnergyBalanceRenderer] Error getting goal colors:', e);
      this._colors = null;
    }

    const validBalances = balanceData.map(d => d.balance);
    const avgBalance = d3.mean(validBalances);
    const totalSurplus = validBalances.filter(b => b > 0).reduce((a, b) => a + b, 0);
    const totalDeficit = validBalances.filter(b => b < 0).reduce((a, b) => a + b, 0);
    const surplusDays = balanceData.filter(d => d.balance > 0).length;
    const deficitDays = balanceData.filter(d => d.balance < 0).length;
    const netTotal = validBalances.reduce((a, b) => a + b, 0);

    this._container.innerHTML = `
 <div class="energy-balance-summary">
 <div class="balance-stat"
   title="Average Daily Balance: ${Math.round(avgBalance)} kcal
Net Total: ${netTotal > 0 ? '+' : ''}${Math.round(netTotal)} kcal (over ${balanceData.length} days)
—
Surplus Days: ${surplusDays} (Total: +${Math.round(totalSurplus)})
Deficit Days: ${deficitDays} (Total: ${Math.round(totalDeficit)})
—
Formula: Daily Intake - Daily TDEE">
 <span class="label">Avg Daily Balance <span class="info-icon">ⓘ</span></span>
 <span class="value ${avgBalance > 0 ? 'surplus' : 'deficit'}">
 ${avgBalance > 0 ? '+' : ''}${Math.round(avgBalance)} kcal
 </span>
 </div>
 </div>
 <div id="energy-balance-chart" class="energy-balance-chart"></div>
 `;

    try {
      this._renderChart(balanceData, this._colors);
    } catch (e) {
      console.error('[EnergyBalanceRenderer] Error rendering chart:', e);
    }
  },

  _renderChart(data, colors) {
    const { surplusColor, deficitColor } = colors || {
      surplusColor: 'var(--warning-color, #f59e0b)',
      deficitColor: 'var(--primary-color)',
    };
    const container = document.getElementById('energy-balance-chart');
    if (!container) return;

    container.innerHTML = '';

    const width = container.clientWidth;
    if (width === 0) return;

    const height = 180;
    const margin = { top: 10, right: 10, bottom: 20, left: 40 };

    const svg = d3.select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const x = d3.scaleBand()
      .range([margin.left, width - margin.right])
      .domain(data.map(d => d.date))
      .padding(0.2);

    const maxAbs = d3.max(data, d => Math.abs(d.balance)) || 500;
    const y = d3.scaleLinear()
      .range([height - margin.bottom, margin.top])
      .domain([-maxAbs, maxAbs]);

    svg.append("line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "var(--text-muted)")
      .attr("stroke-opacity", 0.3);

    svg.selectAll(".balance-bar")
      .data(data)
      .enter().append("rect")
      .attr("class", "balance-bar")
      .attr("x", d => x(d.date))
      .attr("y", d => d.balance > 0 ? y(d.balance) : y(0))
      .attr("width", x.bandwidth())
      .attr("height", d => Math.abs(y(d.balance) - y(0)))
      .attr("fill", d => d.balance > 0 ? surplusColor : deficitColor)
      .attr("opacity", 0.7)
      .append("title")
      .text(d => `${d.date.toLocaleDateString()}\nBalance: ${d.balance > 0 ? '+' : ''}${Math.round(d.balance)} kcal\n(In: ${Math.round(d.intake)} - Out: ${Math.round(d.tdee)})`);

    const yAxis = d3.axisLeft(y)
      .ticks(5)
      .tickFormat(d => Math.abs(d) >= 1000 ? `${(d / 1000).toFixed(1)}k` : d);

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(yAxis)
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").attr("stroke-opacity", 0.1));
  },

  _renderNoData() {
    Utils.renderEmptyState(this._container, {
      title: "Insufficient data",
      detail: "Need both TDEE and calorie intake data to calculate energy balance.",
      icon: "⚡",
    });
  }
};