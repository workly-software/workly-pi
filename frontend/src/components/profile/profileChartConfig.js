export const salesConfig = () => ({
  type: 'line',
  data: {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
    datasets: []
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    legend: { display: true, position: 'bottom', labels: { fontColor: '#d6d1c4' } },
    tooltips: { mode: 'index', intersect: false },
    scales: {
      yAxes: [
        {
          id: 'y-axis-money',
          type: 'linear',
          position: 'left',
          ticks: { beginAtZero: true, fontColor: '#8a938d' },
          gridLines: { color: 'rgba(120,112,96, 0.10)' }
        },
        {
          id: 'y-axis-count',
          type: 'linear',
          position: 'right',
          ticks: { beginAtZero: true, precision: 0, fontColor: '#8a938d' },
          gridLines: { drawOnChartArea: false, color: 'rgba(120,112,96, 0.10)' }
        }
      ]
    }
  }
});

export const revenueConfig = () => ({
  type: 'doughnut',
  data: {
    labels: ['Sem receita ainda'],
    datasets: [
      {
        data: [1],
        backgroundColor: ['rgba(120,112,96, 0.35)'],
        borderColor: '#ffffff',
        borderWidth: 2
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    cutoutPercentage: 70,
    legend: { position: 'bottom', labels: { fontColor: '#d6d1c4' } }
  }
});

export const viewsConfig = () => ({
  type: 'bar',
  data: {
    labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    datasets: [
      {
        label: 'Atividades',
        data: [0, 0, 0, 0, 0, 0, 0],
        backgroundColor: 'rgba(34, 197, 94, 0.85)'
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    legend: { display: false },
    scales: {
      yAxes: [
        {
          ticks: { beginAtZero: true, precision: 0, fontColor: '#8a938d' },
          gridLines: { color: 'rgba(120,112,96, 0.10)' }
        }
      ],
      xAxes: [
        { ticks: { fontColor: '#8a938d' }, gridLines: { color: 'rgba(120,112,96, 0.08)' } }
      ]
    }
  }
});
