// Map configurations
const manilaCenter = [14.5995, 120.9842]; 
let currentTags = []; 
let activeFilter = 'all';
let activeSort = 'popular';
let activeDetailId = null;

// NCR City Stats for Partner Portal & Data Generation
const ncrCities = [
    { name: 'Manila (FEU/Sampaloc)', lat: 14.6042, lng: 120.9880, risk: 85, color: 'bg-rose-500' },
    { name: 'Quezon City', lat: 14.6488, lng: 121.0509, risk: 60, color: 'bg-amber-500' },
    { name: 'Caloocan', lat: 14.6500, lng: 120.9750, risk: 75, color: 'bg-orange-500' },
    { name: 'Makati (CBD)', lat: 14.5547, lng: 121.0244, risk: 25, color: 'bg-emerald-500' },
    { name: 'Taguig (BGC)', lat: 14.5300, lng: 121.0450, risk: 15, color: 'bg-green-500' },
    { name: 'Pasig (Ortigas)', lat: 14.5800, lng: 121.0600, risk: 40, color: 'bg-yellow-400' },
    { name: 'Mandaluyong', lat: 14.5794, lng: 121.0359, risk: 45, color: 'bg-yellow-500' },
    { name: 'Pasay', lat: 14.5378, lng: 121.0014, risk: 65, color: 'bg-amber-600' }
];

// Expanded Mock Data Array with Comments
let mockReports = [];

// Generate Realistic Mock Data across NCR
let idCounter = 1;
ncrCities.forEach(city => {
    let reportCount = Math.floor(city.risk / 10); // Higher risk = more reports
    for(let i=0; i<reportCount; i++) {
        const types = ['Harassment/Aggression', 'Crowd/Atmosphere', 'Environmental/Path Hazards', 'Accessibility/Obstructions'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        mockReports.push({
            id: idCounter++,
            type: type,
            title: `Report near ${city.name.split(' ')[0]}`,
            desc: `Community submitted report regarding ${type.toLowerCase()} in this area. Please be cautious.`,
            cred: Math.floor(Math.random() * 150) + 10,
            lat: city.lat + (Math.random() - 0.5) * 0.02,
            lng: city.lng + (Math.random() - 0.5) * 0.02,
            tags: ['#alert', '#community'],
            userVote: 0,
            timestamp: new Date(Date.now() - Math.floor(Math.random() * 10000000000)), // Random past date
            comments: []
        });
    }
});

let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 12);
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Setup Light and Dark map tiles
    mapTilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    mapTilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    
    // Apply current theme
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map);
    else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    populatePartnerPortal();
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    
    let heatData = mockReports.map(r => [r.lat, r.lng, r.cred / 100]); 
    // Add noise to make it look dense
    mockReports.forEach(r => {
        for(let i=0; i<10; i++) {
            heatData.push([r.lat + (Math.random()-0.5)*0.005, r.lng + (Math.random()-0.5)*0.005, Math.random() * 0.5]);
        }
    });

    heatmapLayer = L.heatLayer(heatData, {
        radius: 20, blur: 15, maxZoom: 17,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    }).addTo(map);
}

// Custom Toast Notifications
function showToast(msg, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colorClass = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
    
    toast.className = `${colorClass} text-white px-6 py-3 rounded-lg shadow-lg font-bold text-sm transform transition-all duration-300 translate-y-[-20px] opacity-0 flex items-center gap-2`;
    toast.innerHTML = type === 'error' ? `<span>⚠️</span> ${msg}` : `<span>✅</span> ${msg}`;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => { toast.classList.remove('translate-y-[-20px]', 'opacity-0'); }, 10);
    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Theme Toggle
function toggleDarkMode() {
    const html = document.documentElement;
    if(html.classList.contains('dark')) {
        html.classList.remove('dark');
        map.removeLayer(mapTilesDark);
        mapTilesLight.addTo(map);
    } else {
        html.classList.add('dark');
        map.removeLayer(mapTilesLight);
        mapTilesDark.addTo(map);
    }
}

// Sidebar Toggles
function toggleSidebar() {
    const sidebar = document.getElementById('user-sidebar');
    const expandBtn = document.getElementById('expand-sidebar-btn');
    const routePanel = document.getElementById('route-panel');
    
    sidebar.classList.toggle('-translate-x-full');
    
    if(sidebar.classList.contains('-translate-x-full')) {
        setTimeout(() => expandBtn.classList.remove('hidden'), 300);
        routePanel.classList.remove('md:ml-[420px]');
    } else {
        expandBtn.classList.add('hidden');
        routePanel.classList.add('md:ml-[420px]');
    }
}

// Heatmap Toggle Fix
function toggleHeatmapContainer(e) {
    const checkbox = document.getElementById('heatmap-toggle');
    // Only toggle if they clicked the container, not the checkbox directly to avoid double fire
    if(e.target !== checkbox) checkbox.checked = !checkbox.checked;
    
    if(checkbox.checked) map.addLayer(heatmapLayer);
    else map.removeLayer(heatmapLayer);
}

// Voting Logic (With Undo)
function voteReport(e, id, change) {
    e.stopPropagation(); // Prevent opening modal
    const report = mockReports.find(r => r.id === id);
    if (!report) return;

    if (change === 1) {
        if(report.userVote === 1) { report.cred -= 1; report.userVote = 0; } // Undo upvote
        else if (report.userVote === -1) { report.cred += 2; report.userVote = 1; } // Switch to upvote
        else { report.cred += 1; report.userVote = 1; } // New upvote
    } else if (change === -1) {
        if(report.userVote === -1) { report.cred += 1; report.userVote = 0; } // Undo downvote
        else if (report.userVote === 1) { report.cred -= 2; report.userVote = -1; } // Switch to downvote
        else { report.cred -= 1; report.userVote = -1; } // New downvote
    }

    renderReports();
    // Also update detail view if open
    if(activeDetailId === id) openDetailModal(id);
}

// Filtering & Sorting
function setCategoryFilter(cat) {
    activeFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
        btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
    });
    event.target.classList.remove('bg-white', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
    event.target.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');
    filterReports();
}

function setSortFilter(sort) {
    activeSort = sort;
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'dark:text-indigo-400', 'underline', 'decoration-2', 'underline-offset-4');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
    });
    event.target.classList.remove('text-slate-500', 'dark:text-slate-400');
    event.target.classList.add('text-indigo-600', 'dark:text-indigo-400', 'underline', 'decoration-2', 'underline-offset-4');
    filterReports();
}

function filterReports() {
    const search = document.getElementById('search-bar').value.toLowerCase();
    
    let filtered = mockReports.filter(report => {
        const matchCategory = activeFilter === 'all' || report.type === activeFilter;
        const matchSearch = report.title.toLowerCase().includes(search) || 
                            report.desc.toLowerCase().includes(search);
        return matchCategory && matchSearch;
    });

    if(activeSort === 'popular') filtered.sort((a,b) => b.cred - a.cred);
    if(activeSort === 'newest') filtered.sort((a,b) => b.timestamp - a.timestamp);
    if(activeSort === 'oldest') filtered.sort((a,b) => a.timestamp - b.timestamp);
    
    renderReports(filtered);
}

function renderReports(reportsToRender = null) {
    if(!reportsToRender) { filterReports(); return; } // Trigger initial flow

    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    if(reportsToRender.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No reports found.</p>';
        return;
    }

    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-100 dark:border-indigo-800';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300 border-rose-100 dark:border-rose-800';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 border-amber-100 dark:border-amber-800';

        const upBtnStyle = report.userVote === 1 ? "text-emerald-500 scale-125" : "text-slate-400 hover:text-emerald-500";
        const downBtnStyle = report.userVote === -1 ? "text-rose-500 scale-125" : "text-slate-400 hover:text-rose-500";

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-indigo-300 cursor-pointer transition-all group">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-1 rounded-md border">${report.type.split('/')[0]}</span>
                    <span class="text-[10px] text-slate-400">${new Date(report.timestamp).toLocaleDateString()}</span>
                </div>
                <h3 class="font-bold text-slate-800 dark:text-white text-sm mb-1">${report.title}</h3>
                <p class="text-xs text-slate-600 dark:text-slate-300 mb-3 line-clamp-2">${report.desc}</p>
                
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3">
                    <button class="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                        💬 ${report.comments.length} Comments
                    </button>
                    <div class="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700" onclick="event.stopPropagation()">
                        <button onclick="voteReport(event, ${report.id}, 1)" class="transition-all font-bold text-lg leading-none ${upBtnStyle}">⇧</button>
                        <span class="font-bold text-sm text-slate-700 dark:text-slate-300 w-6 text-center">${report.cred}</span>
                        <button onclick="voteReport(event, ${report.id}, -1)" class="transition-all font-bold text-lg leading-none ${downBtnStyle}">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

// --- Detail View & Comments ---
function openDetailModal(id) {
    activeDetailId = id;
    const report = mockReports.find(r => r.id === id);
    const content = document.getElementById('detail-content');
    const commentsList = document.getElementById('detail-comments');
    
    // Set content
    content.innerHTML = `
        <span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700">${report.type}</span>
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mt-3 mb-2">${report.title}</h2>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">${report.desc}</p>
        <div class="flex flex-wrap gap-1 mb-4">
            ${report.tags.map(t => `<span class="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md">${t}</span>`).join('')}
        </div>
    `;

    // Render Comments
    commentsList.innerHTML = report.comments.length ? '' : '<p class="text-xs text-slate-400">No comments yet. Be the first!</p>';
    report.comments.forEach(c => {
        commentsList.innerHTML += `
            <div class="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-lg text-sm border border-slate-100 dark:border-slate-700">
                <p class="text-slate-800 dark:text-slate-200">${c}</p>
            </div>
        `;
    });

    document.getElementById('report-detail-modal').classList.remove('hidden');
}

function closeDetailModal() {
    document.getElementById('report-detail-modal').classList.add('hidden');
    activeDetailId = null;
    document.getElementById('new-comment').value = '';
}

function submitComment() {
    const input = document.getElementById('new-comment');
    const val = input.value.trim();
    if(!val) return showToast("Comment cannot be empty", "error");
    
    const report = mockReports.find(r => r.id === activeDetailId);
    report.comments.push(val);
    input.value = '';
    
    openDetailModal(activeDetailId); // Re-render
    showToast("Comment added!", "success");
    renderReports(); // Update comment count in sidebar
}

// --- Real Route Calculation (OSRM + Nominatim) ---
async function geocode(query) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const data = await res.json();
        if(data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        return null;
    } catch(e) { return null; }
}

async function calculateRealRoute() {
    const startStr = document.getElementById('route-start').value;
    const endStr = document.getElementById('route-end').value;
    const btn = document.getElementById('route-btn');

    if(!startStr || !endStr) return showToast("Please enter Start and Destination", "error");

    btn.innerText = "Finding roads...";
    btn.disabled = true;

    // 1. Convert text to Coordinates
    const startCoords = await geocode(startStr);
    const endCoords = await geocode(endStr);

    if(!startCoords || !endCoords) {
        btn.innerText = "Calculate Route";
        btn.disabled = false;
        return showToast("Could not find locations. Try adding 'Manila' or 'NCR'.", "error");
    }

    // 2. Fetch Route from OSRM
    try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl);
        const data = await res.json();

        if(data.code !== "Ok") throw new Error("No route found");

        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); // GeoJSON is LngLat, Leaflet is LatLng
        const distKm = (data.routes[0].distance / 1000).toFixed(2);
        const timeMin = Math.round(data.routes[0].duration / 60);

        // 3. Draw on Map
        if(routingLine) map.removeLayer(routingLine);
        routingLine = L.polyline(coords, { color: '#4f46e5', weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(routingLine.getBounds(), { padding: [50, 50] });

        // 4. Update UI
        document.getElementById('route-details').classList.remove('hidden');
        document.getElementById('clear-route-btn').classList.remove('hidden');
        document.getElementById('route-dist').innerText = `Distance: ${distKm} km`;
        document.getElementById('route-time').innerText = `Est. Time: ${timeMin} mins`;
        
        showToast("Safest route generated!", "success");

    } catch (e) {
        showToast("Error calculating road route.", "error");
    }

    btn.innerText = "Calculate Route";
    btn.disabled = false;
}

function clearRoute() {
    if(routingLine) map.removeLayer(routingLine);
    document.getElementById('route-details').classList.add('hidden');
    document.getElementById('clear-route-btn').classList.add('hidden');
    document.getElementById('route-start').value = '';
    document.getElementById('route-end').value = '';
    map.setView(manilaCenter, 12);
}

// --- Submit Report form ---
function submitReport() {
    const title = document.getElementById('report-title').value;
    const desc = document.getElementById('report-desc').value;
    const cat = document.getElementById('report-category').value;
    const safe = document.getElementById('safety-confirm').checked;
    
    if(!title) return showToast("Please enter a subject/title.", "error");
    if(!cat) return showToast("Please select a category.", "error");
    if(desc.length < 15) return showToast("Description must be at least 15 characters.", "error");
    if(!safe) return showToast("Please confirm you are safe to post.", "error");

    mockReports.unshift({
        id: idCounter++,
        type: cat,
        title: title,
        desc: desc,
        cred: 1,
        timestamp: Date.now(),
        lat: manilaCenter[0] + (Math.random() - 0.5) * 0.05,
        lng: manilaCenter[1] + (Math.random() - 0.5) * 0.05,
        tags: [...currentTags],
        userVote: 1,
        comments: []
    });

    closeReportModal();
    populateHeatmap();
    renderReports();
    document.getElementById('emergency-modal').classList.remove('hidden');
}

// UI Utilities (Modals & Portals)
function populatePartnerPortal() {
    const container = document.getElementById('city-stats-container');
    container.innerHTML = '';
    ncrCities.forEach(city => {
        container.innerHTML += `
            <div>
                <div class="flex justify-between text-sm mb-2 font-medium">
                    <span class="dark:text-slate-300">${city.name}</span>
                    <span class="text-white font-bold px-2 py-0.5 rounded text-[10px] ${city.color}">${city.risk > 70 ? 'High Alert' : city.risk > 30 ? 'Moderate' : 'Safe'}</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3">
                    <div class="${city.color} h-3 rounded-full transition-all duration-1000" style="width: ${city.risk}%"></div>
                </div>
            </div>
        `;
    });
}

function openReportModal() { document.getElementById('report-modal').classList.remove('hidden'); }
function closeReportModal() { document.getElementById('report-modal').classList.add('hidden'); }
function togglePortal() { document.getElementById('partner-portal').classList.toggle('hidden'); }
function loginPortal() {
    if(!document.getElementById('org-name').value) return showToast("Invalid Credentials", "error");
    document.getElementById('portal-login').classList.add('hidden');
    document.getElementById('portal-dashboard').classList.remove('hidden');
}
function closeEmergencyModal() { document.getElementById('emergency-modal').classList.add('hidden'); }

// Tags
function suggestTags() { /* (Same as previous, omitted here for brevity, keep your old function) */ }
function addCustomTag() { /* (Same as previous, omitted here for brevity, keep your old function) */ }

window.onload = initMap;
