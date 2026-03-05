const manilaCenter = [14.6042, 120.9880]; // FEU Tech
let activeFilter = 'all';
let activeDetailId = null;
let activeFlagId = null;

// Routing State
let searchTimeout;
let startCoords = null;
let endCoords = null;

// Dense Mock Data Generation
const ncrCities = [
    { name: 'Manila (Sampaloc)', lat: 14.6042, lng: 120.9880, risk: 85 },
    { name: 'Manila (Intramuros)', lat: 14.5896, lng: 120.9750, risk: 65 },
    { name: 'Quezon City (Diliman)', lat: 14.6515, lng: 121.0500, risk: 55 },
    { name: 'Quezon City (Cubao)', lat: 14.6186, lng: 121.0526, risk: 75 },
    { name: 'Makati (CBD)', lat: 14.5547, lng: 121.0244, risk: 25 },
    { name: 'Taguig (BGC)', lat: 14.5300, lng: 121.0450, risk: 15 },
    { name: 'Pasay (Taft)', lat: 14.5378, lng: 120.9980, risk: 80 }
];

let mockReports = [];
let idCounter = 1;

ncrCities.forEach(city => {
    let reportCount = Math.floor(city.risk / 5); // Lots of data points
    for(let i=0; i<reportCount; i++) {
        const types = ['Harassment/Aggression', 'Crowd/Atmosphere', 'Environmental/Path Hazards'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        mockReports.push({
            id: idCounter++,
            type: type,
            title: `${type.split('/')[0]} near ${city.name.split(' ')[0]}`,
            desc: `Community submitted report regarding an incident here. Please exercise caution when walking alone.`,
            cred: Math.floor(Math.random() * 200) + 5,
            lat: city.lat + (Math.random() - 0.5) * 0.03, // Wider spread
            lng: city.lng + (Math.random() - 0.5) * 0.03,
            tags: ['#alert'],
            userVote: 0,
            timestamp: Date.now() - Math.floor(Math.random() * 10000000000),
            comments: [],
            isMine: false // Flag to check ownership
        });
    }
});

let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 13);
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapTilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    mapTilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map);
    else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    populatePartnerPortal();
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    
    let heatData = mockReports.map(r => [r.lat, r.lng, r.cred / 80]); 
    // Add extra padding data to make the heatmap thick
    mockReports.forEach(r => {
        for(let i=0; i<5; i++) {
            heatData.push([r.lat + (Math.random()-0.5)*0.005, r.lng + (Math.random()-0.5)*0.005, Math.random() * 0.4]);
        }
    });

    heatmapLayer = L.heatLayer(heatData, {
        radius: 22, blur: 18, maxZoom: 17,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    }).addTo(map);
}

// UI Utilities
function showToast(msg, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
    toast.className = `${colorClass} text-white px-6 py-3 rounded-lg shadow-lg font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center gap-2`;
    toast.innerHTML = type === 'error' ? `<span>⚠️</span> ${msg}` : `<span>✅</span> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function toggleDarkMode() {
    const html = document.documentElement;
    if(html.classList.contains('dark')) {
        html.classList.remove('dark');
        map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
    } else {
        html.classList.add('dark');
        map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
    }
}

function toggleSidebar() {
    document.getElementById('user-sidebar').classList.toggle('-translate-x-full');
    document.getElementById('expand-sidebar-btn').classList.toggle('hidden');
    document.getElementById('route-panel').classList.toggle('md:ml-[420px]');
}

function toggleHeatmap() {
    if(document.getElementById('heatmap-toggle').checked) map.addLayer(heatmapLayer);
    else map.removeLayer(heatmapLayer);
}

// Report Rendering & Interaction
function setCategoryFilter(cat) {
    activeFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
        btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
    });
    event.target.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
    event.target.classList.remove('bg-white', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
    filterReports();
}

function filterReports() {
    const search = document.getElementById('search-bar').value.toLowerCase();
    let filtered = mockReports.filter(report => {
        const matchCat = activeFilter === 'all' || report.type === activeFilter;
        const matchSearch = report.title.toLowerCase().includes(search) || report.desc.toLowerCase().includes(search);
        return matchCat && matchSearch;
    });
    filtered.sort((a,b) => b.cred - a.cred);
    renderReports(filtered);
}

function renderReports(reportsToRender = null) {
    if(!reportsToRender) { filterReports(); return; } 

    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-400';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400';

        // Delete button only if owned, otherwise Flag button
        const actionBtn = report.isMine 
            ? `<button onclick="deleteReport(event, ${report.id})" class="text-rose-400 hover:text-rose-600 font-bold text-xs">🗑 Delete</button>`
            : `<button onclick="openFlagModal(event, ${report.id})" class="text-slate-400 hover:text-rose-500 font-bold text-xs" title="Report this post">🚩 Flag</button>`;

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-300 cursor-pointer group relative">
                <div class="absolute top-4 right-4">${actionBtn}</div>
                <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-1 rounded-md border mb-2 inline-block">${report.type.split('/')[0]}</span>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-1 pr-10">${report.title}</h3>
                <p class="text-xs text-slate-600 dark:text-slate-300 mb-3 line-clamp-2">${report.desc}</p>
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span class="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">💬 ${report.comments.length} Comments</span>
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700" onclick="event.stopPropagation()">
                        <button onclick="voteReport(event, ${report.id}, 1)" class="font-bold text-lg text-slate-400 hover:text-emerald-500">⇧</button>
                        <span class="font-bold text-sm">${report.cred}</span>
                        <button onclick="voteReport(event, ${report.id}, -1)" class="font-bold text-lg text-slate-400 hover:text-rose-500">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

// Ownership Deletion logic
function deleteReport(e, id) {
    e.stopPropagation();
    if(confirm("Are you sure you want to delete your report?")) {
        mockReports = mockReports.filter(r => r.id !== id);
        showToast("Report deleted", "success");
        renderReports();
        populateHeatmap();
    }
}

function deleteComment(reportId, commentIndex) {
    if(confirm("Delete your comment?")) {
        const report = mockReports.find(r => r.id === reportId);
        report.comments.splice(commentIndex, 1);
        showToast("Comment deleted", "success");
        openDetailModal(reportId); // Refresh modal
        renderReports(); // Refresh comment count
    }
}

// Flagging logic
function openFlagModal(e, id) {
    e.stopPropagation();
    activeFlagId = id;
    document.getElementById('flag-reason').value = '';
    document.getElementById('flag-modal').classList.remove('hidden');
}
function closeFlagModal() { document.getElementById('flag-modal').classList.add('hidden'); }
function submitFlag() {
    const reason = document.getElementById('flag-reason').value;
    if(!reason) return showToast("Please select a reason.", "error");
    closeFlagModal();
    showToast("Report flagged for moderation review.", "success");
}

function voteReport(e, id, change) {
    e.stopPropagation();
    const report = mockReports.find(r => r.id === id);
    if (!report) return;
    report.cred += change; // Simplified voting for prototype speed
    renderReports();
    if(activeDetailId === id) openDetailModal(id);
}

// Detail View
function openDetailModal(id) {
    activeDetailId = id;
    const report = mockReports.find(r => r.id === id);
    document.getElementById('detail-content').innerHTML = `
        <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider px-2 py-1 rounded-md border">${report.type}</span>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mt-3 mb-2">${report.title}</h2>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">${report.desc}</p>
    `;
    
    const cList = document.getElementById('detail-comments');
    cList.innerHTML = report.comments.length ? '' : '<p class="text-xs text-slate-400">No comments yet.</p>';
    report.comments.forEach((c, idx) => {
        const delBtn = c.isMine ? `<button onclick="deleteComment(${report.id}, ${idx})" class="text-rose-500 hover:text-rose-700 font-bold ml-2">✕</button>` : '';
        cList.innerHTML += `<div class="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg text-sm flex justify-between"><p class="text-slate-800 dark:text-slate-200">${c.text}</p>${delBtn}</div>`;
    });
    document.getElementById('report-detail-modal').classList.remove('hidden');
}
function closeDetailModal() { document.getElementById('report-detail-modal').classList.add('hidden'); }

function submitComment() {
    const val = document.getElementById('new-comment').value.trim();
    if(!val) return;
    const report = mockReports.find(r => r.id === activeDetailId);
    report.comments.push({ text: val, isMine: true }); // Mark as owned by user
    document.getElementById('new-comment').value = '';
    openDetailModal(activeDetailId);
    renderReports();
}

// --- Autocomplete & Pedestrian Routing ---

// Debounced Nominatim Search
function handleSearch(inputEl, resultsId, target) {
    clearTimeout(searchTimeout);
    const query = inputEl.value;
    const resultsUl = document.getElementById(resultsId);
    
    if(query.length < 3) { resultsUl.classList.add('hidden'); return; }

    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=ph`);
            const data = await res.json();
            
            resultsUl.innerHTML = '';
            if(data.length === 0) { resultsUl.classList.add('hidden'); return; }

            data.forEach(item => {
                const li = document.createElement('li');
                li.className = "p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 dark:text-slate-200 text-slate-700";
                li.innerText = item.display_name;
                li.onclick = () => {
                    inputEl.value = item.display_name.split(',')[0]; // Simplify name in input
                    resultsUl.classList.add('hidden');
                    if(target === 'start') startCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                    if(target === 'end') endCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                };
                resultsUl.appendChild(li);
            });
            resultsUl.classList.remove('hidden');
        } catch(e) { console.error("Search error"); }
    }, 500); // Wait 500ms after user stops typing
}

async function calculateRealRoute() {
    const btn = document.getElementById('route-btn');
    if(!startCoords || !endCoords) return showToast("Please select valid Start and Destination from suggestions.", "error");

    btn.innerText = "Finding safe paths..."; btn.disabled = true;

    try {
        // Use /foot/ profile for walking routes. Request steps=true to get street names
        const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(osrmUrl);
        const data = await res.json();

        if(data.code !== "Ok") throw new Error();

        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        const distKm = (data.routes[0].distance / 1000).toFixed(2);
        const timeMin = Math.round(data.routes[0].duration / 60);

        if(routingLine) map.removeLayer(routingLine);
        routingLine = L.polyline(coords, { color: '#4f46e5', weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(routingLine.getBounds(), { padding: [50, 50] });

        // Parse street steps
        const steps = data.routes[0].legs[0].steps;
        const streetList = document.getElementById('route-streets');
        streetList.innerHTML = '';
        
        let lastStreet = "";
        steps.forEach(step => {
            if(step.name && step.name !== lastStreet) {
                streetList.innerHTML += `<li class="flex items-center gap-2"><span>▪</span> ${step.name}</li>`;
                lastStreet = step.name;
            }
        });
        if(streetList.innerHTML === '') streetList.innerHTML = '<li>Unnamed paths/alleys</li>';

        document.getElementById('route-details').classList.remove('hidden');
        document.getElementById('clear-route-btn').classList.remove('hidden');
        document.getElementById('route-dist').innerHTML = `🚶 ${distKm} km`;
        document.getElementById('route-time').innerHTML = `⏱ ${timeMin} mins`;
        
        showToast("Safe walking route found!", "success");

    } catch (e) {
        showToast("Error calculating road route.", "error");
    }
    btn.innerText = "Calculate Route"; btn.disabled = false;
}

function clearRoute() {
    if(routingLine) map.removeLayer(routingLine);
    document.getElementById('route-details').classList.add('hidden');
    document.getElementById('clear-route-btn').classList.add('hidden');
    document.getElementById('route-start').value = '';
    document.getElementById('route-end').value = '';
    startCoords = null; endCoords = null;
    map.setView(manilaCenter, 13);
}

// Submitting Reports
function openReportModal() { document.getElementById('report-modal').classList.remove('hidden'); }
function closeReportModal() { document.getElementById('report-modal').classList.add('hidden'); }
function submitReport() {
    const title = document.getElementById('report-title').value;
    const cat = document.getElementById('report-category').value;
    const desc = document.getElementById('report-desc').value;
    const safe = document.getElementById('safety-confirm').checked;
    
    if(!title || !cat || desc.length < 15 || !safe) return showToast("Please fill all required fields properly.", "error");

    mockReports.unshift({
        id: idCounter++, type: cat, title: title, desc: desc, cred: 1, timestamp: Date.now(),
        lat: manilaCenter[0] + (Math.random() - 0.5) * 0.05,
        lng: manilaCenter[1] + (Math.random() - 0.5) * 0.05,
        tags: [], comments: [], userVote: 0,
        isMine: true // User owns this report
    });

    closeReportModal(); populateHeatmap(); renderReports();
    document.getElementById('emergency-modal').classList.remove('hidden');
}

// Portal
function togglePortal() { document.getElementById('partner-portal').classList.toggle('hidden'); }
function loginPortal() {
    document.getElementById('portal-login').classList.add('hidden');
    document.getElementById('portal-dashboard').classList.remove('hidden');
    document.getElementById('logout-btn').classList.remove('hidden');
}
function logoutPortal() {
    document.getElementById('portal-dashboard').classList.add('hidden');
    document.getElementById('logout-btn').classList.add('hidden');
    document.getElementById('portal-login').classList.remove('hidden');
    showToast("Logged out securely.", "success");
}

function populatePartnerPortal() {
    const container = document.getElementById('city-stats-container');
    container.innerHTML = '';
    ncrCities.forEach(city => {
        const color = city.risk > 70 ? 'bg-rose-500' : city.risk > 40 ? 'bg-amber-500' : 'bg-emerald-500';
        container.innerHTML += `
            <div>
                <div class="flex justify-between text-sm mb-2 font-medium">
                    <span class="dark:text-slate-300">${city.name}</span>
                    <span class="text-white font-bold px-2 py-0.5 rounded text-[10px] ${color}">${city.risk > 70 ? 'High Alert' : 'Safe'}</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3">
                    <div class="${color} h-3 rounded-full transition-all duration-1000" style="width: ${city.risk}%"></div>
                </div>
            </div>`;
    });
}

function closeEmergencyModal() { document.getElementById('emergency-modal').classList.add('hidden'); }
window.onload = initMap;
