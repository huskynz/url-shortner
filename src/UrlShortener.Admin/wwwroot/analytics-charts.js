// Local aggregate-only charts. Controls change the view, never the source counts.
(() => {
  const charts = new Map();
  const colors = ['#60a5fa', '#34d399', '#a1a1aa', '#fbbf24', '#f87171', '#64748b'];
  const kinds = ['line', 'doughnut', 'bar', 'horizontalBar'];
  const numbers = new Intl.NumberFormat(undefined);
  let observer;

  function destroy(canvas) {
    const state = charts.get(canvas);
    if (state) {
      state.abort?.abort();
      state.chart.destroy();
      charts.delete(canvas);
    }
    if (!charts.size && observer) {
      observer.disconnect();
      observer = undefined;
    }
  }

  function plottedData(state) {
    const { labels, values, hidden, kind, pointLimit } = state;
    if (state.categories || pointLimit === 0 || labels.length <= pointLimit)
      return values.map((value, index) => kind !== 'doughnut' && hidden.has(index) ? null : value);
    // Explicit display sampling only. Keep complete source arrays and original
    // category indices so dates/tooltips/zoom remain accurate, including endpoints.
    const first = state.zoom ? state.start : 0;
    const last = state.zoom ? state.end : labels.length - 1;
    const count = Math.min(pointLimit, last - first + 1);
    return Array.from({ length: count }, (_, point) => {
      const index = count === 1 ? first : first + Math.round(point * (last - first) / (count - 1));
      return kind === 'horizontalBar' ? { x: values[index], y: index } : { x: index, y: values[index] };
    });
  }

  function isSampled(state) {
    return !state.categories && state.pointLimit > 0 && state.labels.length > state.pointLimit;
  }

  function configuration(state) {
    const { kind, labels, values, hidden } = state;
    const donut = kind === 'doughnut';
    const horizontal = kind === 'horizontalBar';
    const bar = horizontal || kind === 'bar';
    const font = { family: 'Tahoma, sans-serif' };
    const countAxis = {
      beginAtZero: true, border: { display: false }, grid: { color: '#242424' },
      ticks: { color: '#8a8a8a', font, precision: 0, maxTicksLimit: 6, callback: value => numbers.format(value) }
    };
    const categoryAxis = {
      border: { display: false }, grid: { display: false },
      ticks: {
        color: '#8a8a8a', font, maxTicksLimit: horizontal ? Math.min(labels.length, 12) : bar ? 24 : 8,
        maxRotation: 0, autoSkip: !horizontal || labels.length > 30,
        ...(horizontal ? { callback: function(value) {
          const label = this.getLabelForValue(value);
          return label.length > 28 ? label.slice(0, 25) + '…' : label;
        } } : {})
      }
    };
    if (state.zoom && (state.start > 0 || state.end < labels.length - 1)) {
      categoryAxis.min = state.start;
      categoryAxis.max = state.end;
    }
    return {
      type: bar ? 'bar' : kind,
      data: {
        labels: [...labels],
        datasets: [{
          label: 'Visits', data: plottedData(state), parsing: !isSampled(state),
          borderColor: donut ? '#111111' : colors[0],
          backgroundColor: donut ? colors : bar ? '#60a5fa' : context => {
            const area = context.chart.chartArea;
            if (!area) return 'rgba(96,165,250,0.08)';
            const gradient = context.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            gradient.addColorStop(0, 'rgba(96,165,250,0.16)');
            gradient.addColorStop(1, 'rgba(96,165,250,0.01)');
            return gradient;
          },
          borderWidth: donut ? 3 : bar ? 0 : 2, maxBarThickness: horizontal ? 16 : 32,
          fill: !donut && !bar, tension: 0, pointRadius: values.length === 1 ? 4 : state.showPoints && kind === 'line' ? 3 : 0,
          pointBackgroundColor: colors[0],
          pointHoverRadius: 5, pointHitRadius: 12, hoverOffset: donut ? 5 : 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
        onClick: (event, elements) => {
          const hit = elements[0];
          if (state.categories && hit?.element?.inRange(event.x, event.y, true)) control(state.canvas, 'category', hit.index);
        },
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 },
        cutout: donut ? '76%' : undefined,
        interaction: { intersect: false, mode: donut || bar ? 'nearest' : 'index', axis: donut ? 'xy' : horizontal ? 'y' : 'x' },
        layout: { padding: donut ? 8 : { top: 16, right: 8 } },
        plugins: {
          legend: { display: false }, decimation: { enabled: false },
          tooltip: {
            backgroundColor: '#1f1f1f', titleColor: '#f0f0f0', bodyColor: '#c4c4c4',
            borderColor: '#4a4a4a', borderWidth: 1, cornerRadius: 0, padding: 10, displayColors: donut,
            titleFont: font, bodyFont: font,
            callbacks: {
              title: items => items[0]?.label ?? '',
              label: context => {
                const value = donut ? context.parsed : horizontal ? context.parsed.x : context.parsed.y;
                const total = values.reduce((sum, count) => sum + count, 0);
                // Hiding a category must not renormalize its share of all visits.
                return `${numbers.format(value)} visits${donut && total ? ` · ${(value / total * 100).toFixed(1)}% of all visits` : ''}`;
              }
            }
          }
        },
        scales: donut ? {} : { x: horizontal ? countAxis : categoryAxis, y: horizontal ? categoryAxis : countAxis }
      },
      plugins: [{
        id: 'analyticsBackground',
        beforeDraw(chart) {
          const ctx = chart.ctx;
          ctx.save(); ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, chart.width, chart.height); ctx.restore();
        }
      }]
    };
  }

  function updateUi(state) {
    const root = state.root;
    if (!root) return;
    root.classList.toggle('analytics-widget--donut', state.kind === 'doughnut');
    const select = root.querySelector('[data-chart-type]');
    if (select) select.value = state.kind;
    const limit = root.querySelector('[data-chart-limit]');
    if (limit) { limit.value = state.pointLimit === 0 ? 'all' : String(state.pointLimit); limit.disabled = state.categories; }
    const points = root.querySelector('[data-chart-points]');
    if (points) { points.checked = state.showPoints; points.disabled = state.kind !== 'line' || state.categories; }
    const zoomed = state.start > 0 || state.end < state.labels.length - 1;
    const status = root.querySelector('[data-chart-status]');
    if (status) status.textContent = state.categories
      ? `${state.labels.length - state.hidden.size} of ${state.labels.length} categories shown · table counts unchanged`
      : zoomed
        ? `Zoomed: ${state.labels[state.start]} — ${state.labels[state.end]} · ${state.end - state.start + 1} of ${state.labels.length} buckets · full totals below`
        : `Full period · ${numbers.format(state.labels.length)} source points · exact values below`;
    const visible = state.zoom ? state.end - state.start + 1 : state.labels.length;
    if (status && !state.categories && state.pointLimit > 0 && visible > state.pointLimit)
      status.textContent += ` · Sampled: ${numbers.format(state.pointLimit)} of ${numbers.format(visible)} points in view (peaks may be omitted); choose Show all for every point · totals and tables include all data`;
    if (status) state.canvas.setAttribute?.('aria-description', status.textContent);
    for (const button of root.querySelectorAll('[data-chart-category]')) {
      const visible = !state.hidden.has(Number(button.dataset.chartCategory));
      button.setAttribute('aria-pressed', String(visible));
      button.classList.toggle('is-hidden', !visible);
    }
    const disabled = { left: state.start === 0, right: state.end === state.labels.length - 1, 'zoom-out': !zoomed, 'zoom-in': state.end - state.start < 2 };
    for (const [command, value] of Object.entries(disabled)) {
      const button = root.querySelector(`[data-chart-command="${command}"]`);
      if (button) button.disabled = value;
    }
    state.canvas.style.cursor = zoomed ? 'grab' : '';
    state.canvas.style.touchAction = zoomed ? 'none' : 'auto';
  }

  function rebuild(state) {
    state.chart?.destroy();
    state.chart = new window.Chart(state.canvas, configuration(state));
    if (state.kind === 'doughnut') {
      for (const index of state.hidden) state.chart.toggleDataVisibility(index);
      if (state.hidden.size) state.chart.update('none');
    }
    updateUi(state);
  }

  function windowAt(state, start, size) {
    size = Math.max(1, Math.min(state.labels.length, size));
    state.start = Math.max(0, Math.min(state.labels.length - size, Math.round(start)));
    state.end = state.start + size - 1;
    const axis = state.kind === 'horizontalBar' ? state.chart.options.scales.y : state.chart.options.scales.x;
    if (size === state.labels.length) { delete axis.min; delete axis.max; }
    else { axis.min = state.start; axis.max = state.end; }
    state.chart.data.datasets[0].data = plottedData(state);
    state.chart.update('none');
    updateUi(state);
  }

  function control(canvas, command, argument) {
    const state = charts.get(canvas);
    if (!state) return false;
    if (command === 'type') {
      if (!kinds.includes(argument) || (argument === 'doughnut' && !state.categories)) return false;
      state.kind = argument;
      rebuild(state);
    } else if (command === 'limit') {
      if (state.categories || !['1000', '5000', '10000', 'all'].includes(argument)) return false;
      state.pointLimit = argument === 'all' ? 0 : Number(argument);
      rebuild(state);
    } else if (command === 'points') {
      if (state.kind !== 'line' || state.categories || typeof argument !== 'boolean') return false;
      state.showPoints = argument;
      state.chart.data.datasets[0].pointRadius = state.values.length === 1 ? 4 : argument ? 3 : 0;
      state.chart.update('none'); updateUi(state);
    } else if (command === 'reset') {
      state.start = 0; state.end = state.labels.length - 1; state.hidden.clear();
      state.kind = state.defaultKind;
      state.showPoints = false;
      state.pointLimit = 5000;
      rebuild(state);
    } else if (command === 'category') {
      if (!state.categories || !Number.isInteger(argument) || argument < 0 || argument >= state.labels.length) return false;
      if (state.hidden.has(argument)) state.hidden.delete(argument); else state.hidden.add(argument);
      if (state.kind === 'doughnut') state.chart.toggleDataVisibility(argument);
      else state.chart.data.datasets[0].data = state.values.map((value, index) => state.hidden.has(index) ? null : value);
      state.chart.update('none'); updateUi(state);
    } else if (command === 'download') {
      state.chart.stop(); state.chart.update('none');
      const link = document.createElement('a');
      link.download = (canvas.getAttribute('aria-label') || 'analytics').replace(/[^a-z0-9]+/gi, '-').slice(0, 80) + '.png';
      link.href = state.chart.toBase64Image('image/png');
      link.click();
    } else if (state.zoom && state.labels.length > 1) {
      const size = state.end - state.start + 1;
      if (command === 'zoom-in' || command === 'zoom-out') {
        const next = Math.max(Math.min(3, state.labels.length), Math.min(state.labels.length,
          command === 'zoom-in' ? Math.ceil(size / 2) : size * 2));
        const anchor = Math.max(0, Math.min(1, Number.isFinite(argument) ? argument : 0.5));
        windowAt(state, state.start + (size - next) * anchor, next);
      } else if (command === 'left' || command === 'right') {
        windowAt(state, state.start + (command === 'left' ? -1 : 1) * Math.max(1, Math.floor(size / 2)), size);
      } else return false;
    } else return false;
    return true;
  }

  function listen(state) {
    if (!state.root) return;
    state.abort = new AbortController();
    const options = { signal: state.abort.signal };
    state.root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !state.root.contains(button) || button.disabled) return;
      if (button.dataset.chartCommand) control(state.canvas, button.dataset.chartCommand);
      else if (button.dataset.chartCategory !== undefined) control(state.canvas, 'category', Number(button.dataset.chartCategory));
    }, options);
    state.root.addEventListener('change', event => {
      if (event.target.matches('[data-chart-type]')) control(state.canvas, 'type', event.target.value);
      else if (event.target.matches('[data-chart-limit]') && !event.target.disabled) control(state.canvas, 'limit', event.target.value);
      else if (event.target.matches('[data-chart-points]') && !event.target.disabled) control(state.canvas, 'points', event.target.checked);
    }, options);
    if (!state.zoom) return;
    const coordinate = event => state.kind === 'horizontalBar' ? event.clientY : event.clientX;
    const areaSize = () => state.kind === 'horizontalBar'
      ? state.chart.chartArea.bottom - state.chart.chartArea.top : state.chart.chartArea.right - state.chart.chartArea.left;
    state.canvas.addEventListener('wheel', event => {
      if (!event.shiftKey || state.labels.length < 4 || areaSize() <= 0) return; // Ordinary scrolling still scrolls the page.
      event.preventDefault();
      const box = state.canvas.getBoundingClientRect();
      const area = state.chart.chartArea;
      const offset = state.kind === 'horizontalBar' ? box.top + area.top : box.left + area.left;
      control(state.canvas, event.deltaY < 0 ? 'zoom-in' : 'zoom-out', (coordinate(event) - offset) / areaSize());
    }, { ...options, passive: false });
    state.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || state.end - state.start + 1 === state.labels.length) return;
      state.drag = { position: coordinate(event), start: state.start, size: state.end - state.start + 1 };
      state.canvas.setPointerCapture(event.pointerId);
    }, options);
    state.canvas.addEventListener('pointermove', event => {
      if (!state.drag || areaSize() <= 0) return;
      const moved = Math.round((coordinate(event) - state.drag.position) / areaSize() * state.drag.size);
      const next = Math.max(0, Math.min(state.labels.length - state.drag.size, state.drag.start - moved));
      if (next !== state.start) windowAt(state, next, state.drag.size);
    }, options);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      state.canvas.addEventListener(event, () => { state.drag = null; }, options);
    }
  }

  window.analyticsCharts = {
    destroy, control,
    render(canvas, kind, labels, values, zoom = false, categories = kind === 'doughnut', resetFocus = false) {
      if (!canvas || !canvas.isConnected || typeof window.Chart !== 'function') return false;
      if (!kinds.includes(kind) || labels.length !== values.length || values.some(value => !Number.isFinite(value) || value < 0)) return false;
      const previous = charts.get(canvas);
      const sameLabels = previous && labels.length === previous.labels.length && labels.every((label, index) => label === previous.labels[index]);
      const sameData = sameLabels && values.every((value, index) => value === previous.values[index]);
      const state = {
        canvas, root: canvas.closest?.('.analytics-widget'), labels: [...labels], values: [...values],
        kind: previous?.defaultKind === kind && (categories ? previous.kind !== 'line' : previous.kind !== 'doughnut') ? previous.kind : kind,
        defaultKind: kind, zoom, categories,
        showPoints: !categories && (previous?.showPoints ?? false),
        pointLimit: previous?.pointLimit ?? 5000,
        start: sameData && !resetFocus ? previous.start : 0, end: sameData && !resetFocus ? previous.end : labels.length - 1,
        hidden: sameLabels ? new Set(previous.hidden) : new Set()
      };
      try {
        destroy(canvas);
        rebuild(state);
        charts.set(canvas, state);
        listen(state);
        if (!observer) {
          observer = new MutationObserver(() => {
            for (const element of charts.keys()) if (!element.isConnected) destroy(element);
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
        return true;
      } catch (error) {
        state.abort?.abort();
        destroy(canvas);
        window.Chart.getChart?.(canvas)?.destroy();
        console.warn('Analytics chart could not be rendered.', error);
        return false;
      }
    }
  };
})();
