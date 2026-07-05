/**
 * analytics.js — Advanced analytical dashboards
 */

import { renderNavbar } from '../components/navbar.js';
import InstallmentsService from '../services/installments.service.js';
import { BarChart, LineChart } from '../components/chart.js';
import { formatCurrency } from '../config.js';

export default async function init() {
  renderNavbar('Analytics', 'Performance indices and projections');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h1>Analytics &amp; Forecasting</h1>
        <p>Operational collections performance over time</p>
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
  if (chartRes.success) {
    const data = chartRes.data;
    LineChart(document.getElementById('analytics-line-container'), data, { height: 220 });
    BarChart(document.getElementById('analytics-bar-container'), data, { height: 220 });
  }
}
