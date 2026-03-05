const manilaCenter = [14.6060, 120.9870]; 
let activeFilter = 'all';
let activeSort = 'relevant';
let activeDetailId = null;
let currentTags = [];

// Drag State
let isDragging = false, startX, startY, initialLeft, initialTop;

// High-Density Localized Mock Data (FEU, UST, SM San Lazaro Focus)
const hotspots = [
    { name: 'FEU Tech (P. Paredes)', lat: 14.6042, lng: 120.9880, risk: 90, types: ['Environmental/Path Hazards', 'Accessibility/Obstructions'], descPool: ["Dimly lit alley near campus exit.", "Construction completely blocking pedestrian path.", "Heavy flooding in front of the gate."] },
    { name: 'FEU Main (Morayta)', lat: 14.6035, lng: 120.9873, risk: 85, types: ['Harassment/Aggression', 'Crowd/Atmosphere'], descPool: ["Group of men catcalling students.", "Extremely overcrowded sidewalk, pickpocket risk.", "Suspicious individuals loitering near overpass."] },
    { name: 'UST (España Blvd)', lat: 14.6096, lng: 120.9894, risk: 95, types: ['Environmental/Path Hazards', 'Crowd/Atmosphere'], descPool: ["Deep gutter flooding.", "Pedestrian overpass very crowded and slippery.", "Waiting shed full, people standing directly on road."] },
    { name: 'UST (Dapitan/Novál)', lat: 14.6110, lng: 120.9870, risk: 80, types: ['Accessibility/Obstructions', 'Harassment/Aggression'], descPool: ["Sidewalk vendors fully blocking the path.", "Uncomfortable staring from group at the corner.", "Tricycles parked on the pedestrian lane."] },
    { name: 'SM San Lazaro / Tayuman', lat: 14.6155, lng: 120.9841, risk: 75, types: ['Crowd/Atmosphere', 'Accessibility/Obstructions'], descPool: ["Jeepney terminal chaotic, no clear lines.", "Heavy traffic pushing pedestrians to narrow edges.", "Pickpocket attempt near mall entrance."] }
];

let mockReports = [];
let idCounter = 1;

hotspots.forEach(spot => {
    // Generate ~40-60 reports per hotspot for a dense heatmap
    let reportCount = Math.floor(spot.risk / 1.8); 
    for(let i=0; i<reportCount; i++) {
        const isPrimaryIssue = Math.random() > 0.4;
        const type = isPrimaryIssue ? spot.types[Math.floor(Math.random() * spot.types.length)] : ['Harassment/Aggression', 'Crowd/Atmosphere', 'Environmental/Path Hazards', 'Accessibility/Obstructions'][Math.floor(Math.random() * 4)];
        
        mockReports.push({
            id: idCounter++,
            type: type,
            title: `${type.split('/')[0]} near ${spot.name.split(' ')[0]}`,
            desc: isPrimaryIssue ? spot.descPool[Math.floor(Math.random() * spot.descPool.length)] : `General community report regarding safety in this area. Exercise caution.`,
            cred: Math.floor(Math.random() * 300) + 10,
            relevance: spot.risk + Math.random() * 20,
            lat: spot.lat + (Math.random() - 0.5) * 0.007, 
            lng: spot.lng + (Math.random() - 0.5) * 0.007,
            tags: ['#' + spot.name.split(' ')[0].replace(/[^a-zA-Z]/g, '').toLowerCase(), '#ncr_alert'],
            userVote: 0,
            timestamp: Date.now() - (Math.random() * 10000000000),
            comments: Math.random() > 0.6 ? [{text: "Verified. Avoid this area if possible.", isMine: false}] : [],
            isMine: false
        });
    }
});

let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;
let searchTimeout;
let startCoords = null;
let endCoords = null;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 15);
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapTilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    mapTilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map);
    else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    populatePartnerPortal();
    setupDrag();
    
    // Setup initial absolute positioning for route panel to ensure drag works right away
    const panel = document.getElementById("route-panel");
    const isMobile = window.innerWidth < 768;
    panel.style.left = isMobile ? '16px' : '440px';
    panel.style.top = '24px';
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    let heatData = mockReports.map(r => [r.lat, r.lng, r.cred / 100]); 
    // Padding to make heat spots thick
    mockReports.forEach(r => {
        for(let i=0; i<3; i++) heatData.push([r.lat + (Math.random()-0.5)*0.001, r.lng + (Math.random()-0.5)*0.001, Math.random() * 0.6]);
    });

    heatmapLayer = L.heatLayer(heatData, {
        radius: 25, blur: 20, maxZoom: 18,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    }).addTo(map);
}

// Fixed Drag Logic
function setupDrag() {
    const panel = document.getElementById("route-panel");
    const header = document.getElementById("route-panel-header");

    header.onmousedown = dragStart;
    header.ontouchstart = dragStart;

    function dragStart(e) {
        if(e.target.tagName.toLowerCase() === 'button') return;
        e.preventDefault();
        isDragging = true;
        
        startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        document.onmousemove = drag;
        document.ontouchmove = drag;
        document.onmouseup = dragEnd;
        document.ontouchend = dragEnd;
    }

    function drag(e) {
        if(!isDragging) return;
        e.preventDefault();
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        let dx = clientX - startX;
        let dy = clientY - startY;
        
        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        // Boundaries
        const sidebar = document.getElementById('user-sidebar');
        const sidebarWidth = sidebar.classList.contains('-translate-x-full') ? 0 : sidebar.offsetWidth;
        const navHeight = 64; 
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;

        if(newLeft < sidebarWidth + 10) newLeft = sidebarWidth + 10;
        if(newLeft > maxX - 10) newLeft = maxX - 10;
        if(newTop < navHeight + 10) newTop = navHeight + 10;
        if(newTop > maxY - 10) newTop = maxY - 10;

        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
    }

    function dragEnd() {
        isDragging = false;
        document.onmousemove = null;
        document.ontouchmove = null;
        document.onmouseup = null;
        document.ontouchend = null;
    }
}

// UI Toggles
function showToast(msg, type='success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `${type==='error'?'bg-rose-500':'bg-emerald-500'} text-white px-6 py-3 rounded shadow-lg font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0`;
    toast.innerHTML = type==='error' ? `⚠️ ${msg}` : `✅ ${msg}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-y-[-20px]', 'opacity-0'), 10);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function toggleDarkMode() {
    const html = document.documentElement;
    if(html.classList.contains('dark')) {
        html.classList.remove('dark'); map.removeLayer(mapTilesDark); mapTilesLight.addTo(map);
    } else {
        html.classList.add('dark'); map.removeLayer(mapTilesLight); mapTilesDark.addTo(map);
    }
}

function toggleSidebar() {
    document.getElementById('user-sidebar').classList.toggle('-translate-x-full');
    document.getElementById('expand-sidebar-btn').classList.toggle('hidden');
    
    // Auto-adjust route panel if it's trapped under the re-opened sidebar
    const panel = document.getElementById("route-panel");
    const rect = panel.getBoundingClientRect();
    const sidebarWidth = document.getElementById('user-sidebar').classList.contains('-translate-x-full') ? 0 : document.getElementById('user-sidebar').offsetWidth;
    if (rect.left < sidebarWidth + 10) {
        panel.style.left = (sidebarWidth + 20) + 'px';
    }
}

function toggleHeatmap() {
    if(document.getElementById('heatmap-toggle').checked) map.addLayer(heatmapLayer);
    else map.removeLayer(heatmapLayer);
}

// Filters & Sorting
function setCategoryFilter(cat) {
    activeFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-slate-600');
    });
    event.target.classList.add('bg-indigo-600', 'text-white');
    event.target.classList.remove('bg-white', 'dark:bg-slate-800', 'text-slate-600');
    filterReports();
}

function setSortFilter(sortType) {
    activeSort = sortType;
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'underline');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
    });
    event.target.classList.add('text-indigo-600', 'dark:text-indigo-400', 'underline');
    event.target.classList.remove('text-slate-500');
    filterReports();
}

// Voting Fixed with stopPropagation
function voteReport(e, id, change) {
    e.preventDefault();
    e.stopPropagation(); // CRITICAL FIX: prevents the click from opening the modal
    
    const report = mockReports.find(r => r.id === id);
    if (!report) return;
    report.cred += change;
    renderReports();
    if(activeDetailId === id) openDetailModal(id);
}

function filterReports() {
    const search = document.getElementById('search-bar').value.toLowerCase();
    let filtered = mockReports.filter(report => {
        const matchCat = activeFilter === 'all' || report.type === activeFilter;
        const matchSearch = report.title.toLowerCase().includes(search) || report.desc.toLowerCase().includes(search) || report.tags.some(t => t.toLowerCase().includes(search));
        return matchCat && matchSearch;
    });

    if(activeSort === 'relevant') filtered.sort((a,b) => b.relevance - a.relevance);
    else if(activeSort === 'popular') filtered.sort((a,b) => b.cred - a.cred);
    else if(activeSort === 'newest') filtered.sort((a,b) => b.timestamp - a.timestamp);
    else if(activeSort === 'oldest') filtered.sort((a,b) => a.timestamp - b.timestamp);
    
    renderReports(filtered);
}

function renderReports(reportsToRender = null) {
    if(!reportsToRender) { filterReports(); return; } 
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';

        const actionBtn = report.isMine 
            ? `<button onclick="deleteReport(event, ${report.id})" class="text-rose-400 hover:text-rose-600 font-bold text-xs">🗑 Delete</button>`
            : `<button onclick="openFlagModal(event, ${report.id})" class="text-slate-400 hover:text-rose-500 font-bold text-xs">🚩 Flag</button>`;

        const tagHTML = report.tags.map(t => `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">${t}</span>`).join('');

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-4 rounded-md shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-300 cursor-pointer relative">
                <div class="absolute top-4 right-4">${actionBtn}</div>
                <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-0.5 rounded border mb-2 inline-block">${report.type.split('/')[0]}</span>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-1 pr-10">${report.title}</h3>
                <p class="text-xs text-slate-600 dark:text-slate-300 mb-2 line-clamp-2">${report.desc}</p>
                <div class="flex flex-wrap gap-1.5 mb-3">${tagHTML}</div>
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3">
                    <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400">💬 ${report.comments.length} Comments</span>
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700" onclick="event.stopPropagation()">
                        <button onclick="voteReport(event, ${report.id}, 1)" class="font-bold text-base text-slate-400 hover:text-emerald-500">⇧</button>
                        <span class="font-bold text-sm">${report.cred}</span>
                        <button onclick="voteReport(event, ${report.id}, -1)" class="font-bold text-base text-slate-400 hover:text-rose-500">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function deleteReport(e, id) {
    e.stopPropagation();
    if(confirm("Delete this report?")) {
        mockReports = mockReports.filter(r => r.id !== id);
        showToast("Report deleted", "success");
        renderReports(); populateHeatmap();
    }
}
function openFlagModal(e, id) { e.stopPropagation(); document.getElementById('flag-modal').classList.remove('hidden'); }
function closeFlagModal() { document.getElementById('flag-modal').classList.add('hidden'); }
function submitFlag() { closeFlagModal(); showToast("Report flagged.", "success"); }

// Tags
function suggestTags() {
    const title = document.getElementById('report-title').value.toLowerCase();
    const cat = document.getElementById('report-category').value;
    const aiTags = document.getElementById('ai-tags');
    const container = document.getElementById('tag-container');
    
    let suggested = [];
    if(cat === 'Harassment/Aggression') suggested.push('#unsafe', '#catcalling');
    if(cat === 'Crowd/Atmosphere') suggested.push('#overcrowded', '#pickpocket');
    if(cat === 'Environmental/Path Hazards') suggested.push('#hazard', '#dark_alley');
    if(cat === 'Accessibility/Obstructions') suggested.push('#blocked', '#pwd_issue');
    
    if(title.includes('feu')) suggested.push('#FEU');
    if(title.includes('ust') || title.includes('espana')) suggested.push('#UST');
    if(title.includes('sm') || title.includes('lazaro')) suggested.push('#SMSanLazaro');

    if(suggested.length === 0) { aiTags.classList.add('hidden'); return; }
    aiTags.classList.remove('hidden');
    container.innerHTML = suggested.map(tag => `<span class="text-[10px] font-bold bg-white text-indigo-600 border border-indigo-200 px-2 py-1 rounded cursor-pointer hover:bg-indigo-50" onclick="addTag('${tag}')">${tag} +</span>`).join('');
}
function handleTagKeypress(e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }
function addCustomTag() {
    let val = document.getElementById('custom-tag-input').value.trim().replace(/\s+/g, '_');
    if(val) { if(!val.startsWith('#')) val = '#' + val; addTag(val.toLowerCase()); document.getElementById('custom-tag-input').value = ''; }
}
function addTag(tag) {
    if(!currentTags.includes(tag)) {
        currentTags.push(tag);
        document.getElementById('active-tags-container').innerHTML = currentTags.map(t => `<span class="text-xs bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1">${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 font-bold ml-1">×</button></span>`).join('');
    }
}
function removeTag(tag) { currentTags = currentTags.filter(t => t !== tag); addTag('hack'); /* forces render */ }

// Submission
function openReportModal() { document.getElementById('report-modal').classList.remove('hidden'); }
function closeReportModal() { document.getElementById('report-modal').classList.add('hidden'); }
function submitReport() {
    const title = document.getElementById('report-title').value;
    const cat = document.getElementById('report-category').value;
    const desc = document.getElementById('report-desc').value;
    if(!title || !cat || desc.length < 15) return showToast("Fill required fields properly", "error");

    mockReports.unshift({
        id: idCounter++, type: cat, title: title, desc: desc, cred: 1, relevance: 100, timestamp: Date.now(),
        lat: manilaCenter[0] + (Math.random() - 0.5) * 0.01, lng: manilaCenter[1] + (Math.random() - 0.5) * 0.01,
        tags: [...currentTags], comments: [], userVote: 1, isMine: true
    });
    closeReportModal(); populateHeatmap(); renderReports(); currentTags = [];
}

// Partner Portal Extenstions
function populatePartnerPortal() {
    const container = document.getElementById('city-stats-container');
    const feed = document.getElementById('live-feed');
    container.innerHTML = ''; feed.innerHTML = '';
    
    hotspots.forEach(spot => {
        const color = spot.risk > 80 ? 'bg-rose-600' : spot.risk > 60 ? 'bg-amber-500' : 'bg-emerald-500';
        container.innerHTML += `
            <div class="mb-4">
                <div class="flex justify-between text-sm mb-1.5 font-bold">
                    <span class="dark:text-slate-300">${spot.name}</span>
                    <span class="text-white px-2 py-0.5 rounded text-[10px] uppercase ${color}">${spot.risk > 80 ? 'High Alert' : 'Moderate'}</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5">
                    <div class="${color} h-2.5 rounded-full" style="width: ${spot.risk}%"></div>
                </div>
            </div>`;
    });

    // Populate Live Feed with newest reports
    mockReports.slice(0, 8).forEach(r => {
        feed.innerHTML += `
            <div class="p-3 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm">
                <p class="font-bold text-slate-800 dark:text-white">${r.title} <span class="text-[10px] text-slate-400 font-normal ml-2">Just now</span></p>
                <p class="text-xs text-slate-500 mt-1">${r.type}</p>
            </div>
        `;
    });
}
function togglePortal() { document.getElementById('partner-portal').classList.toggle('hidden'); }
function loginPortal() { document.getElementById('portal-login').classList.add('hidden'); document.getElementById('portal-dashboard').classList.remove('hidden'); document.getElementById('logout-btn').classList.remove('hidden'); }
function logoutPortal() { document.getElementById('portal-dashboard').classList.add('hidden'); document.getElementById('logout-btn').classList.add('hidden'); document.getElementById('portal-login').classList.remove('hidden'); showToast("Logged out.", "success");}

// Routing Logic (Nominatim/OSRM)
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
                li.className = "p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700";
                li.innerText = item.display_name;
                li.onclick = () => {
                    inputEl.value = item.display_name.split(',')[0]; 
                    resultsUl.classList.add('hidden');
                    if(target === 'start') startCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                    if(target === 'end') endCoords = [parseFloat(item.lat), parseFloat(item.lon)];
                };
                resultsUl.appendChild(li);
            });
            resultsUl.classList.remove('hidden');
        } catch(e) {}
    }, 500);
}
async function calculateRealRoute() {
    if(!startCoords || !endCoords) return showToast("Select valid Start and Destination.", "error");
    document.getElementById('route-btn').innerText = "Finding roads...";
    try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/foot/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson&steps=true`);
        const data = await res.json();
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        if(routingLine) map.removeLayer(routingLine);
        routingLine = L.polyline(coords, { color: '#4f46e5', weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(routingLine.getBounds(), { padding: [50, 50] });

        const steps = data.routes[0].legs[0].steps;
        const streetList = document.getElementById('route-streets');
        streetList.innerHTML = ''; let lastStreet = "";
        steps.forEach(step => {
            if(step.name && step.name !== lastStreet) {
                streetList.innerHTML += `<li class="flex items-center gap-2 text-xs"><span>▪</span> ${step.name}</li>`;
                lastStreet = step.name;
            }
        });

        document.getElementById('route-details').classList.remove('hidden');
        document.getElementById('clear-route-btn').classList.remove('hidden');
        document.getElementById('route-dist').innerHTML = `🚶 ${(data.routes[0].distance / 1000).toFixed(2)} km`;
        document.getElementById('route-time').innerHTML = `⏱ ${Math.round(data.routes[0].duration / 60)} mins`;
    } catch (e) { showToast("Error finding route.", "error"); }
    document.getElementById('route-btn').innerText = "Calculate Safe Route";
}
function clearRoute() {
    if(routingLine) map.removeLayer(routingLine);
    document.getElementById('route-details').classList.add('hidden');
    document.getElementById('clear-route-btn').classList.add('hidden');
    document.getElementById('route-start').value = ''; document.getElementById('route-end').value = '';
    startCoords = null; endCoords = null;
    map.setView(manilaCenter, 15);
}

// Comments Detail Modal
function openDetailModal(id) {
    activeDetailId = id;
    const report = mockReports.find(r => r.id === id);
    document.getElementById('detail-content').innerHTML = `
        <span class="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider px-2 py-1 rounded border">${report.type}</span>
        <h2 class="text-xl font-bold text-slate-800 dark:text-white mt-4 mb-2">${report.title}</h2>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded">${report.desc}</p>
    `;
    const cList = document.getElementById('detail-comments');
    cList.innerHTML = report.comments.length ? '' : '<p class="text-sm text-slate-400">No comments yet.</p>';
    report.comments.forEach(c => {
        cList.innerHTML += `<div class="bg-slate-50 dark:bg-slate-800 p-3 rounded text-sm"><p class="text-slate-800 dark:text-slate-200">${c.text}</p></div>`;
    });
    document.getElementById('report-detail-modal').classList.remove('hidden');
}
function closeDetailModal() { document.getElementById('report-detail-modal').classList.add('hidden'); }
function submitComment() {
    const val = document.getElementById('new-comment').value.trim();
    if(!val) return;
    mockReports.find(r => r.id === activeDetailId).comments.push({ text: val });
    document.getElementById('new-comment').value = '';
    openDetailModal(activeDetailId); renderReports();
}
function closeEmergencyModal() { document.getElementById('emergency-modal').classList.add('hidden'); }

window.onload = initMap;
