/**
 * analytics.js — Advanced analytical dashboards
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { BarChart, LineChart } from '../components/chart.js';
import { formatCurrency } from '../config.js';

export default async function init() {
  renderNavbar('Analytics', 'Collection trends and insights');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Analytics</h1>
        <p>Collection performance over the last 6 months</p>
      </div>
    </div>

    <!-- Charts Layout Grid -->
    <div class="grid grid-cols-2 gap-6">
      <div class="card">
        <div class="card-header">
          <h4>Collection Trend (Line)</h4>
        </div>
        <div id="analytics-line-container" style="height:220px"></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h4>Payment Volumes (Bar)</h4>
        </div>
        <div id="analytics-bar-container" style="height:220px"></div>
      </div>
    </div>
  `;

  const chartRes = await InstallmentsService.getCollectionsChart(6);
  const lineEl = document.getElementById('analytics-line-container');
  const barEl = document.getElementById('analytics-bar-container');

  if (chartRes.success && chartRes.data?.length) {
    LineChart(lineEl, chartRes.data, { height: 220 });
    BarChart(barEl, chartRes.data, { height: 220 });
  } else {
    const emptyHtml = `<div class="empty-state" style="padding:40px"><p>${chartRes.success ? 'No collections data yet.' : (chartRes.error || 'Failed to load chart data.')}</p></div>`;
    if (lineEl) lineEl.innerHTML = emptyHtml;
    if (barEl) barEl.innerHTML = emptyHtml;
  }
}
