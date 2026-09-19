/**
 * graph.ts — Live Three-Model Comparison Graph (Chart.js)
 *
 * Plots: REQUIRED USER TORQUE vs HAND OPENING ANGLE
 *
 * Three curves:
 *   - Unassisted (grey)
 *   - Fixed-Radius Passive (amber)
 *   - RELEVA (teal/blue — emphasized but not distorted)
 *
 * The graph reads DIRECTLY from the physics model output.
 * No pre-recorded data. No approximated curves.
 *
 * Graph area shading: NOT shaded by default (Correction 6).
 * Peak torque is displayed as a number instead.
 */

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import type { ModelCurves } from "../physics/model";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

export interface GraphController {
  update(curves: ModelCurves, currentThetaDeg?: number, showAllCurves?: boolean): void;
  destroy(): void;
}

export function buildGraph(canvas: HTMLCanvasElement): GraphController {
  const ctx = canvas.getContext("2d")!;

  const data: ChartData<"line"> = {
    labels: [],
    datasets: [
      {
        label: "Unassisted",
        data: [],
        borderColor: "#6b7280",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        order: 3,
      },
      {
        label: "Fixed-Radius Passive",
        data: [],
        borderColor: "#d97706",
        backgroundColor: "transparent",
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 0,
        tension: 0.4,
        order: 2,
      },
      {
        label: "RELEVA (Variable Cam)",
        data: [],
        borderColor: "#0d9488",
        backgroundColor: "rgba(13, 148, 136, 0.08)",
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
        order: 1,
      },
      // Current angle marker (vertical line via scatter)
      {
        label: "Current angle",
        data: [],
        borderColor: "#2563eb",
        backgroundColor: "#2563eb",
        borderWidth: 1,
        pointRadius: 4,
        pointStyle: "circle",
        showLine: false,
        order: 0,
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 }, // no animation delay — we animate manually
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: "top",
        labels: {
          font: { family: "Inter, system-ui, sans-serif", size: 12 },
          color: "#374151",
          usePointStyle: true,
          padding: 16,
        },
      },
      title: {
        display: true,
        text: "Required User Torque  vs  Hand Opening Angle",
        font: { family: "Inter, system-ui, sans-serif", size: 14, weight: 600 as const },
        color: "#111827",
        padding: { bottom: 8 },
      },
      tooltip: {
        callbacks: {
          label(ctx) {
            const val = ctx.parsed.y;
            if (val == null) return "";
            return `${ctx.dataset.label}: ${val.toFixed(3)} N·m`;
          },
        },
        bodyFont: { family: "Inter, system-ui, sans-serif" },
        titleFont: { family: "Inter, system-ui, sans-serif" },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Opening Angle (°)",
          font: { family: "Inter, system-ui, sans-serif", size: 12, weight: 600 as const },
          color: "#4b5563",
        },
        ticks: {
          font: { family: "Inter, system-ui, sans-serif", size: 11 },
          color: "#6b7280",
          maxTicksLimit: 10,
        },
        grid: { color: "#f3f4f6" },
      },
      y: {
        title: {
          display: true,
          text: "Generalized Opening Torque (N·m)",
          font: { family: "Inter, system-ui, sans-serif", size: 12, weight: 600 as const },
          color: "#4b5563",
        },
        ticks: {
          font: { family: "Inter, system-ui, sans-serif", size: 11 },
          color: "#6b7280",
          callback: (v) => `${Number(v).toFixed(3)}`,
        },
        grid: { color: "#f3f4f6" },
        min: 0,
      },
    },
  };

  const chart = new Chart(ctx, { type: "line", data, options });

  function update(curves: ModelCurves, currentThetaDeg?: number, showAllCurves = true) {
    chart.data.labels = curves.thetaDeg.map((d) => d.toFixed(1));
    chart.data.datasets[0].data = curves.unassisted.map((s) => s.tau_user);
    chart.data.datasets[1].data = curves.fixedRadius.map((s) => s.tau_user);
    chart.data.datasets[2].data = curves.releva.map((s) => s.tau_user);

    // Deterministic dataset visibility
    chart.data.datasets[0].hidden = false;
    chart.data.datasets[1].hidden = !showAllCurves;
    chart.data.datasets[2].hidden = !showAllCurves;

    // Live angle marker on active curve
    if (currentThetaDeg !== undefined) {
      const idx = curves.thetaDeg.findIndex((d) => d >= currentThetaDeg);
      if (idx >= 0) {
        // Track unassisted when showAllCurves is false; track RELEVA when true
        const snap = showAllCurves ? curves.releva[idx] : curves.unassisted[idx];
        chart.data.datasets[3].data = [{ x: currentThetaDeg, y: snap.tau_user }];
        chart.data.datasets[3].hidden = false;
      }
    } else {
      chart.data.datasets[3].data = [];
    }

    chart.update("none");
  }

  function destroy() {
    chart.destroy();
  }

  return { update, destroy };
}
