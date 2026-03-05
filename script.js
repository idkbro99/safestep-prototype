// --- Data & State ---
const feuCoords = [14.6042, 120.9880]; 
let currentTags = []; 
let activeCategory = 'all';
let activeSort = 'recent';
let activeReportIdForComments = null;
let map, heatmapLayer, routingControl;
let isSidebarOpen = true;

// Added timestamps and comments arrays to mock data
const mockReports = [
    { id: 1, type: 'Environmental/Path Hazards', title: 'Broken Streetlight & Dim Alley', desc: 'The alley behind the building is pitch black at night. Makes it feel very unsafe.', cred: 145, lat: 14.6045, lng: 120.9882, tags: ['#no_lights', '#blindspot'], userVote: 0, timestamp: Date.now() - 100000, comments: ['Agreed, I take a longer route to avoid this.', 'Reported to barangay yesterday.'] },
    { id: 2, type: 'Harassment/Aggression', title: 'Group of men catcalling', desc: 'Near the corner of Morayta and Espana. A group frequently loiters here.', cred: 98, lat: 14.6050, lng: 120.9890, tags: ['#catcalling', '#unsafe_vibe'], userVote: 0, timestamp: Date.now() - 500000, comments: ['Stay safe everyone!'] },
    { id: 3, type: 'Accessibility/Obstructions', title: 'Blocked PWD Ramp', desc: 'Sidewalk vendors have completely blocked the wheelchair ramp.', cred: 70, lat: 14.6035, lng: 120.9875, tags: ['#blocked_ramp'], userVote: 0, timestamp: Date.now() - 800000, comments: [] },
    { id: 4, type: 'Crowd/Atmosphere', title: 'Overcrowded / Pickpocket risk', desc: 'Overpass is extremely crowded during rush hour. High risk area.', cred: 112, lat: 14.6028, lng: 120.9885, tags: ['#overcrowded', '#pickpocket_risk'], userVote: 0, timestamp: Date.now() - 200000, comments: ['Someone unzipped my bag here last week.'] },
    { id: 5, type: 'Environmental/Path Hazards', title: 'Deep open manhole', desc: 'Cover is completely missing on P. Campa street. Very dangerous.', cred: 210, lat: 14.6048, lng: 120.9868, tags: ['#hazard'], userVote: 0, timestamp: Date.now() - 50000, comments: [] },
];

const ncrCities = [
    { name: "Manila", status: "High Alert", score: 85, color: "bg-rose-500", text: "text-rose-500", bg: "bg-rose-50" },
    { name: "Quezon City", status: "Moderate", score: 60, color: "bg-amber-400", text: "text-amber-600", bg: "bg-amber-50" },
    { name: "Makati", status: "Safe", score: 25, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
    { name: "Taguig", status: "Safe", score: 30, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
    { name: "Pasig", status: "Moderate", score: 45, color: "bg-amber-400", text: "text-amber-600", bg: "bg-amber-50" },
    { name: "Caloocan", status: "High Alert", score: 75, color: "bg-rose-500", text: "text-rose-500", bg: "bg-rose-50" },
    { name: "Marikina", status: "Safe", score: 20, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
    { name: "Mandaluyong", status: "Moderate", score: 50, color: "bg-amber-400", text: "text-amber-600", bg: "bg-amber-50" },
    { name: "Muntinlupa", status: "Safe", score: 35, color: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" },
    { name: "Pasay", status: "High Alert", score: 80, color: "bg-rose-500", text: "text-rose-500", bg: "bg-rose-50" }
];

// --- Initialization ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView(feuCoords, 16);
    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);

    let heatData = mockReports.map(r => [r.lat, r.lng, r.cred / 50]); 
    for(let i=0; i<80; i++) heatData.push([feuCoords[0] + (Math.random() - 0.5) * 0.008, feuCoords[1] + (Math.random() - 0.5) * 0.008, Math.random() * 0.8]);

    heatmapLayer = L.heatLayer(heatData, { radius: 25, blur: 20, maxZoom: 17, gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'} }).addTo(map);

    applyFilters();
    populatePartnerPortal();
}

// --- Toast UI (Replaces Alerts) ---
function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bg = type === 'error' ? 'bg-rose-500' : 'bg-emerald-500';
    toast.className = `${bg} text-white px-4 py-3 rounded-xl shadow-lg transform transition-all duration-300 translate-x-full opacity-0 flex items-center gap-2`;
    toast.innerHTML = `<span class="font-bold">${type === 'error' ? '⚠️' : '✅'}</span> <span class="text-sm font-medium">${message}</span>`;
    
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => { toast.classList.remove('translate-x-full', 'opacity-0'); }, 10);
    // Animate out and remove
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --- Real Routing (Leaflet Routing Machine + OSRM) ---
async function calculateRoute() {
    const startInput = document.getElementById('route-start').value;
    const endInput = document.getElementById('route-end').value;
    const btn = document.getElementById('route-btn');

    if(!startInput || !endInput) { showToast("Please enter both locations.", "error"); return; }

    btn.innerText = "Routing...";
    btn.classList.add('animate-pulse', 'opacity-75');

    // Remove existing route if any
    clearRoute();

    try {
        // Geocode addresses (Nominatim public API via Leaflet Control Geocoder)
        const geocoder = L.Control.Geocoder.nominatim();
        
        const getCoords = (query) => new Promise((resolve) => {
            // Append 'Manila' to help the free geocoder find local places better
            geocoder.geocode(query + ', Metro Manila', (results) => {
                resolve(results.length > 0 ? results[0].center : null);
            });
        });

        const startCoords = await getCoords(startInput);
        const endCoords = await getCoords(endInput);

        if(!startCoords || !endCoords) {
            showToast("Could not find one of the locations. Try being more specific.", "error");
            btn.innerText = "Calculate Route";
            btn.classList.remove('animate-pulse', 'opacity-75');
            return;
        }

        // Generate Road Route using OSRM
        routingControl = L.Routing.control({
            waypoints: [startCoords, endCoords],
            routeWhileDragging: false,
            addWaypoints: false,
            show: false, // Hides the default ugly instruction panel
            lineOptions: { styles: [{ color: '#4f46e5', opacity: 0.8, weight: 6 }] }
        }).addTo(map);

        routingControl.on('routesfound', function(e) {
            const routes = e.routes;
            const summary = routes[0].summary;
            const distanceKm = (summary.totalDistance / 1000).toFixed(1);
            showToast(`Route found! Approx ${distanceKm} km. Following main roads.`, "success");
            document.getElementById('clear-route-btn').classList.remove('hidden');
            btn.innerText = "Calculate Route";
            btn.classList.remove('animate-pulse', 'opacity-75');
        });

        routingControl.on('routingerror', function() {
            showToast("Error generating route from the server.", "error");
            btn.innerText = "Calculate Route";
            btn.classList.remove('animate-pulse', 'opacity-75');
        });

    } catch (e) {
        showToast("Network error. Please try again.", "error");
        btn.innerText = "Calculate Route";
        btn.classList.remove('animate-pulse', 'opacity-75');
    }
}

function clearRoute() {
    if(routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }
    document.getElementById('clear-route-btn').classList.add('hidden');
    document.getElementById('route-start').value = '';
    document.getElementById('route-end').value = '';
}

// --- Voting Logic (Toggle/Take back) ---
function voteReport(id, value, event) {
    if(event) event.stopPropagation(); // Prevent opening modal when clicking vote
    
    const report = mockReports.find(r => r.id === id);
    if (!report) return;

    if (report.userVote === value) {
        // User clicked the same button again -> Take back vote
        report.cred -= value;
        report.userVote = 0;
    } else {
        // User clicked a new vote (or changed from up to down)
        // If they had a previous vote, remove it first, then add new
        report.cred += value - report.userVote; 
        report.userVote = value;
    }

    applyFilters();
}

// --- Sidebar Filters & UI ---
function setCategoryFilter(cat, btnElement) {
    activeCategory = cat;
    document.querySelectorAll('#category-filters .filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'active-filter');
        btn.classList.add('bg-slate-100', 'text-slate-600');
    });
    btnElement.classList.remove('bg-slate-100', 'text-slate-600');
    btnElement.classList.add('bg-indigo-600', 'text-white', 'active-filter');
    applyFilters();
}

function setSortFilter(sortType, btnElement) {
    activeSort = sortType;
    document.querySelectorAll('#sort-filters .sort-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white', 'active-filter');
        btn.classList.add('bg-slate-100', 'text-slate-600');
    });
    btnElement.classList.remove('bg-slate-100', 'text-slate-600');
    btnElement.classList.add('bg-indigo-600', 'text-white', 'active-filter');
    applyFilters();
}

function applyFilters() {
    const search = document.getElementById('search-bar').value.toLowerCase();
    
    let filtered = mockReports.filter(report => {
        const matchCategory = activeCategory === 'all' || report.type === activeCategory;
        const matchSearch = report.title.toLowerCase().includes(search) || 
                            report.desc.toLowerCase().includes(search) || 
                            report.tags.some(t => t.toLowerCase().includes(search));
        return matchCategory && matchSearch;
    });

    if(activeSort === 'recent') filtered.sort((a,b) => b.timestamp - a.timestamp);
    if(activeSort === 'popular') filtered.sort((a,b) => b.cred - a.cred);
    if(activeSort === 'oldest') filtered.sort((a,b) => a.timestamp - b.timestamp);
    
    renderReports(filtered);
}

function renderReports(reportsToRender) {
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    if(reportsToRender.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-500 text-center py-8">No reports found.</p>';
        return;
    }

    reportsToRender.forEach(report => {
        let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
        if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
        if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';

        const tagHTML = report.tags.map(t => `<span class="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">${t}</span>`).join('');

        const upBtnStyle = report.userVote === 1 ? "text-green-500 scale-125 bg-green-50 rounded" : "text-slate-400 hover:text-green-500 hover:bg-slate-100 rounded px-1";
        const downBtnStyle = report.userVote === -1 ? "text-rose-500 scale-125 bg-rose-50 rounded" : "text-slate-400 hover:text-rose-500 hover:bg-slate-100 rounded px-1";

        // Calculate time ago
        const minsAgo = Math.floor((Date.now() - report.timestamp) / 60000);
        const timeStr = minsAgo < 60 ? `${minsAgo}m ago` : `${Math.floor(minsAgo/60)}h ago`;

        list.innerHTML += `
            <div onclick="openDetailsModal(${report.id})" class="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer group">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold ${typeColor} uppercase tracking-wider px-2 py-1 rounded-md border">${report.type.split('/')[0]}</span>
                    <span class="text-[10px] text-slate-400 font-medium">${timeStr}</span>
                </div>
                <h3 class="font-bold text-slate-800 text-sm mb-1 group-hover:text-indigo-600 transition-colors">${report.title}</h3>
                <p class="text-xs text-slate-600 mb-3 leading-relaxed line-clamp-2">${report.desc}</p>
                <div class="flex flex-wrap gap-1 mb-3">${tagHTML}</div>
                
                <div class="flex justify-between items-center border-t border-slate-50 pt-3">
                    <span class="text-[11px] font-semibold text-slate-400 flex items-center gap-1">💬 ${report.comments.length} Comments</span>
                    <div class="flex items-center gap-2">
                        <button onclick="voteReport(${report.id}, 1, event)" class="transition-all font-bold text-lg leading-none ${upBtnStyle}">⇧</button>
                        <span class="font-bold text-sm text-slate-700 w-4 text-center select-none">${report.cred}</span>
                        <button onclick="voteReport(${report.id}, -1, event)" class="transition-all font-bold text-lg leading-none ${downBtnStyle}">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

// --- Modals & Toggles ---
function toggleHeatmap() {
    if(document.getElementById('heatmap-toggle').checked) map.addLayer(heatmapLayer);
    else map.removeLayer(heatmapLayer);
}

function toggleSidebar() {
    const sidebar = document.getElementById('user-sidebar');
    const expandBtn = document.getElementById('expand-sidebar-btn');
    const routePanel = document.getElementById('route-panel');
    const icon = document.getElementById('sidebar-icon');

    if (isSidebarOpen) {
        sidebar.classList.add('-translate-x-full');
        setTimeout(() => { expandBtn.classList.remove('hidden'); }, 300);
        if(window.innerWidth >= 768) {
            icon.setAttribute('d', 'M9 5l7 7-7 7'); // Arrow Right
            // Move route panel slightly to accommodate map taking full width visually
            routePanel.style.transform = 'translateX(-20px)'; 
        }
    } else {
        sidebar.classList.remove('-translate-x-full');
        expandBtn.classList.add('hidden');
        if(window.innerWidth >= 768) {
            icon.setAttribute('d', 'M15 19l-7-7 7-7'); // Arrow Left
            routePanel.style.transform = 'translateX(0)';
        }
    }
    isSidebarOpen = !isSidebarOpen;
}

function togglePortal() { document.getElementById('partner-portal').classList.toggle('hidden'); }

function loginPortal() {
    const org = document.getElementById('org-name').value;
    const pass = document.getElementById('emp-pass').value;
    if(!org || !pass) { showToast("Credentials required.", "error"); return; }
    
    document.getElementById('portal-login').classList.add('hidden');
    document.getElementById('portal-dashboard').classList.remove('hidden');
    showToast(`Welcome back, ${org}`, "success");
}

function populatePartnerPortal() {
    const container = document.getElementById('city-stats-container');
    container.innerHTML = ncrCities.map(city => `
        <div>
            <div class="flex justify-between text-sm mb-2 font-medium">
                <span>${city.name}</span>
                <span class="${city.text} font-bold ${city.bg} px-2 py-0.5 rounded text-xs">${city.status}</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2.5">
                <div class="${city.color} h-2.5 rounded-full" style="width: ${city.score}%"></div>
            </div>
        </div>
    `).join('');
}

// --- Report Details & Comments ---
function openDetailsModal(id) {
    const report = mockReports.find(r => r.id === id);
    if(!report) return;
    
    activeReportIdForComments = id;
    
    let typeColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
    if(report.type.includes('Harassment')) typeColor = 'text-rose-600 bg-rose-50 border-rose-100';
    if(report.type.includes('Hazards')) typeColor = 'text-amber-600 bg-amber-50 border-amber-100';

    document.getElementById('details-header').innerHTML = `<span class="text-xs font-bold ${typeColor} uppercase tracking-wider px-2 py-1 rounded-md border">${report.type}</span>`;
    document.getElementById('details-title').innerText = report.title;
    document.getElementById('details-desc').innerText = report.desc;
    document.getElementById('details-tags').innerHTML = report.tags.map(t => `<span class="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-md">${t}</span>`).join('');
    
    renderComments(report);
    document.getElementById('details-modal').classList.remove('hidden');
}

function renderComments(report) {
    const list = document.getElementById('comments-list');
    if(report.comments.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-400 italic">No comments yet. Be the first to provide helpful info.</p>';
        return;
    }
    list.innerHTML = report.comments.map(c => `
        <div class="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p class="text-xs font-bold text-slate-700 mb-1">Anonymous User</p>
            <p class="text-sm text-slate-600">${c}</p>
        </div>
    `).join('');
}

function postComment() {
    const input = document.getElementById('new-comment');
    const val = input.value.trim();
    if(!val) return;
    
    // Simulate profanity filter
    if(val.toLowerCase().includes('slur') || val.toLowerCase().includes('swear')) {
        showToast("System blocked inappropriate language.", "error");
        return;
    }
    
    const report = mockReports.find(r => r.id === activeReportIdForComments);
    report.comments.push(val);
    input.value = '';
    renderComments(report);
    applyFilters(); // Update comment count on sidebar
    showToast("Comment posted.", "success");
}

function closeDetailsModal() {
    document.getElementById('details-modal').classList.add('hidden');
    activeReportIdForComments = null;
}

// --- Submit Report Logic ---
function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
    currentTags = []; updateTagDisplay();
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
    document.getElementById('report-title').value = '';
    document.getElementById('report-desc').value = '';
    document.getElementById('report-category').value = '';
    document.getElementById('safety-confirm').checked = false;
    document.getElementById('ai-tags').classList.add('hidden');
    document.getElementById('char-count').innerText = "0/15 min";
    document.getElementById('char-count').className = "text-xs mt-1 text-right font-medium text-slate-400";
}

function submitReport() {
    const title = document.getElementById('report-title').value;
    const desc = document.getElementById('report-desc').value;
    const cat = document.getElementById('report-category').value;
    const safe = document.getElementById('safety-confirm').checked;
    
    if(!title) { showToast("Subject/Title is required.", "error"); return; }
    if(!cat) { showToast("Category is required.", "error"); return; }
    if(desc.length < 15) { showToast("Description must be at least 15 characters.", "error"); return; }
    if(!safe) { showToast("Please confirm you are safe to post.", "error"); return; }

    mockReports.unshift({
        id: Date.now(),
        type: cat, title: title, desc: desc, cred: 1, userVote: 1,
        lat: feuCoords[0] + (Math.random() - 0.5) * 0.002,
        lng: feuCoords[1] + (Math.random() - 0.5) * 0.002,
        tags: [...currentTags],
        timestamp: Date.now(),
        comments: []
    });

    closeReportModal();
    initMap(); // Refresh Heatmap
    showToast("Report securely submitted.", "success");
    
    // Auto-select recent filter to show new post
    setSortFilter('recent', document.querySelector('#sort-filters .sort-btn'));
}

// --- Tags Helper ---
function suggestTags() {
    const cat = document.getElementById('report-category').value;
    const aiTags = document.getElementById('ai-tags');
    const container = document.getElementById('tag-container');
    if(!cat) { aiTags.classList.add('hidden'); return; }
    aiTags.classList.remove('hidden'); container.innerHTML = '';
    
    const predefinedTags = {
        'Harassment/Aggression': ['#catcalling', '#stalking', '#unsafe_vibe'],
        'Crowd/Atmosphere': ['#overcrowded', '#pickpocket_risk'],
        'Environmental/Path Hazards': ['#no_lights', '#flooded', '#blindspot'],
        'Accessibility/Obstructions': ['#blocked_ramp', '#broken_elevator']
    };
    
    predefinedTags[cat].forEach(tag => {
        container.innerHTML += `<span class="text-[11px] font-medium bg-white text-indigo-600 border border-indigo-200 px-2 py-1 rounded-md cursor-pointer hover:bg-indigo-50" onclick="addTag('${tag}')">${tag} +</span>`;
    });
}
function handleTagKeypress(e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }
function addCustomTag() {
    let val = document.getElementById('custom-tag-input').value.trim().replace(/\s+/g, '_');
    if(val) { if(!val.startsWith('#')) val = '#' + val; addTag(val.toLowerCase()); document.getElementById('custom-tag-input').value = ''; }
}
function addTag(tag) { if(!currentTags.includes(tag) && currentTags.length < 5) { currentTags.push(tag); updateTagDisplay(); } }
function removeTag(tag) { currentTags = currentTags.filter(t => t !== tag); updateTagDisplay(); }
function updateTagDisplay() {
    document.getElementById('active-tags-container').innerHTML = currentTags.map(t => `<span class="text-xs bg-indigo-600 text-white px-2 py-1 rounded-md flex items-center gap-1">${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 font-bold ml-1">×</button></span>`).join('');
}
document.getElementById('report-desc').addEventListener('input', (e) => {
    const count = e.target.value.length;
    const counter = document.getElementById('char-count');
    counter.innerText = `${count}/15 min`;
    counter.className = count >= 15 ? "text-xs mt-1 text-right font-medium text-green-500" : "text-xs mt-1 text-right font-medium text-slate-400";
});

window.onload = initMap;
