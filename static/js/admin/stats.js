// Admin Statistics Module

console.log("📊 Admin Stats Loaded");

const AdminStats = (function() {
    let statsData = null;
    
    function init() {
        loadStats();
        bindExport();
    }
    
    function loadStats() {
        fetch('/admin/api/stats')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    statsData = data.data;
                    renderTotalStats(data.data.total_stats);
                    renderGenresChart(data.data.genres);
                    renderMonthsChart(data.data.months);
                    renderTopBooksChart(data.data.top_books);
                    renderDebtorsChart(data.data.top_debtors);
                    document.getElementById('statAvgReturn').textContent = data.data.avg_return_days + ' дн.';
                }
            })
            .catch(error => console.error('Error loading stats:', error));
    }
    
    function renderTotalStats(stats) {
        document.getElementById('statBooks').textContent = stats.books;
        document.getElementById('statLibraries').textContent = stats.libraries;
        document.getElementById('statUsers').textContent = stats.users;
        document.getElementById('statActiveReservations').textContent = stats.active_reservations;
    }
    
    function renderGenresChart(genres) {
        const ctx = document.getElementById('genresChart').getContext('2d');
        
        // Группируем мелкие жанры в "Остальное"
        const topGenres = genres.slice(0, 8);
        const otherCount = genres.slice(8).reduce((sum, g) => sum + g.count, 0);
        
        if (otherCount > 0) {
            topGenres.push({ genre: 'Остальное', count: otherCount });
        }
        
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: topGenres.map(g => g.genre),
                datasets: [{
                    data: topGenres.map(g => g.count),
                    backgroundColor: [
                        '#475569', '#64748b', '#94a3b8', '#cbd5e1',
                        '#334155', '#1e293b', '#0f172a', '#78909c',
                        '#b0bec5'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    }
    
    function renderMonthsChart(months) {
        const ctx = document.getElementById('monthsChart').getContext('2d');
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months.map(m => m.label),
                datasets: [{
                    label: 'Бронирований',
                    data: months.map(m => m.count),
                    backgroundColor: '#475569',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
    
    function renderTopBooksChart(books) {
        const ctx = document.getElementById('topBooksChart').getContext('2d');
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: books.map(b => b.title),
                datasets: [{
                    label: 'Бронирований',
                    data: books.map(b => b.count),
                    backgroundColor: '#0ea5e9',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
    
    function renderDebtorsChart(debtors) {
        const ctx = document.getElementById('debtorsChart').getContext('2d');
        
        if (debtors.length === 0) {
            ctx.canvas.parentNode.innerHTML = '<p class="text-muted text-center py-5">Нет должников</p>';
            return;
        }
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: debtors.map(d => d.username),
                datasets: [{
                    label: 'Просрочек',
                    data: debtors.map(d => d.expired_count),
                    backgroundColor: '#ef4444',
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
    
    function bindExport() {
        document.getElementById('btnExportCSV').addEventListener('click', exportCSV);
    }
    
    function exportCSV() {
        if (!statsData) return;
        
        let csv = 'Статистика библиотечной системы\n\n';
        
        // Жанры
        csv += 'Жанр,Количество книг\n';
        statsData.genres.forEach(g => {
            csv += `"${g.genre}",${g.count}\n`;
        });
        
        csv += '\nБронирования по месяцам\n';
        csv += 'Месяц,Количество\n';
        statsData.months.forEach(m => {
            csv += `${m.label},${m.count}\n`;
        });
        
        csv += '\nТоп-10 книг\n';
        csv += 'Книга,Бронирований\n';
        statsData.top_books.forEach(b => {
            csv += `"${b.title}",${b.count}\n`;
        });
        
        csv += '\nТоп-5 должников\n';
        csv += 'Пользователь,Просрочек\n';
        statsData.top_debtors.forEach(d => {
            csv += `${d.username},${d.expired_count}\n`;
        });
        
        // Скачивание
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'library_stats.csv';
        a.click();
        URL.revokeObjectURL(url);
    }
    
    return { init };
})();

document.addEventListener('DOMContentLoaded', function() {
    AdminStats.init();
});