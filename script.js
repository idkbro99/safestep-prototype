// Center between FEU / UST
const manilaCenter = [14.6060, 120.9870]; 
let activeFilter = 'all';
let activeSort = 'relevant';
let activeDetailId = null;
let currentTags = [];

// Route panel dragging state
let isDragging = false, currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;

// High-Density Localized Mock Data (FEU, UST, SM San Lazaro)
const hotspots = [
    { name: 'FEU Tech Area', lat: 14.6042, lng: 120.9880, risk: 90, typePref: 'Environmental/Path Hazards', issue: 'Dimly lit alley near the campus exit. High risk at night.' },
    { name: 'FEU Main / Morayta', lat: 14.6035, lng: 120.9873, risk: 85, typePref: 'Harassment/Aggression', issue: 'Loiterers catcalling students walking towards España.' },
    { name: 'UST España Blvd', lat: 14.6096, lng: 120.9894, risk: 80, typePref: 'Environmental/Path Hazards', issue: 'Deep flood water hides potholes during heavy rain.' },
    { name: 'SM San Lazaro Vicinity', lat: 14.6155, lng: 120.9841, risk: 65, typePref: 'Crowd/Atmosphere', issue: 'Overcrowded jeepney terminal. Pickpocketing attempts reported.' },
    { name: 'LRT Tayuman Station', lat: 14.6168, lng: 120.9825, risk: 70, typePref: 'Crowd/Atmosphere', issue: 'Very dense crowd. Personal belongings at risk.' }
];

let mockReports = [];
let idCounter = 1;

hotspots.forEach(spot => {
    // Generate 30-40 reports per hotspot to heavily populate the heatmap
    let reportCount = Math.floor(spot.risk / 2.5); 
    for(let i=0; i<reportCount; i++) {
        const isPrimaryIssue = Math.random() > 0.4;
        const type = isPrimaryIssue ? spot.typePref : ['Harassment/Aggression', 'Crowd/Atmosphere', 'Environmental/Path Hazards'][Math.floor(Math.random() * 3)];
        
        // Time distribution for realistic sorting
        const timeOffset = Math.random() * 10000000000; 
        
        mockReports.push({
            id: idCounter++,
            type: type,
            title: `Incident near ${spot.name}`,
            desc: isPrimaryIssue ? spot.issue : `General community report regarding safety in this area.`,
            cred: Math.floor(Math.random() * 250) + 10, // Popularity
            relevance: spot.risk + Math.random() * 20, // Simulated AI relevance score
            lat: spot.lat + (Math.random() - 0.5) * 0.006, // Tight cluster radius
            lng: spot.lng + (Math.random() - 0.5) * 0.006,
            tags: ['#' + spot.name.split(' ')[0].toLowerCase(), '#ncr_alert'],
            userVote: 0,
            timestamp: Date.now() - timeOffset,
            comments: Math.random() > 0.7 ? [{text: "I saw this too, please be careful.", isMine: false}] : [],
            isMine: false
        });
    }
});

let map, heatmapLayer, routingLine;
let mapTilesLight, mapTilesDark;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(manilaCenter, 15); // Zoomed in closer
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapTilesLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    mapTilesDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
    
    if(document.documentElement.classList.contains('dark')) mapTilesDark.addTo(map);
    else mapTilesLight.addTo(map);

    populateHeatmap();
    renderReports();
    populatePartnerPortal();
    setupDrag();
}

function populateHeatmap() {
    if(heatmapLayer) map.removeLayer(heatmapLayer);
    
    let heatData = mockReports.map(r => [r.lat, r.lng, r.cred / 100]); 
    // Extra padding for density
    mockReports.forEach(r => {
        for(let i=0; i<3; i++) {
            heatData.push([r.lat + (Math.random()-0.5)*0.001, r.lng + (Math.random()-0.5)*0.001, Math.random() * 0.5]);
        }
    });

    heatmapLayer = L.heatLayer(heatData, {
        radius: 25, blur: 20, maxZoom: 18,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    }).addTo(map);
}

// Drag Logic for Route Panel
function setupDrag() {
    const dragItem = document.getElementById("route-panel");
    const dragHeader = document.getElementById("route-panel-header");

    dragHeader.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mouseup", dragEnd, false);
    document.addEventListener("mousemove", drag, false);
    
    // Touch support
    dragHeader.addEventListener("touchstart", dragStart, {passive: false});
    document.addEventListener("touchend", dragEnd, false);
    document.addEventListener("touchmove", drag, {passive: false});

    function dragStart(e) {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        if (e.target === dragHeader || dragHeader.contains(e.target)) isDragging = true;
    }

    function dragEnd(e) {
        initialX = currentX; initialY = currentY; isDragging = false;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }
            xOffset = currentX; yOffset = currentY;
            dragItem.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }
}

// Reports & UI
function toggleDarkMode() { /* Same as previous */ }
function toggleSidebar() { /* Same as previous */ }
function toggleHeatmap() {
    if(document.getElementById('heatmap-toggle').checked) map.addLayer(heatmapLayer);
    else map.removeLayer(heatmapLayer);
}

function setCategoryFilter(cat) {
    activeFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600');
    });
    event.target.classList.add('bg-indigo-600', 'text-white');
    event.target.classList.remove('bg-slate-50', 'dark:bg-slate-800', 'text-slate-600');
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

function filterReports() {
    const search = document.getElementById('search-bar').value.toLowerCase();
    let filtered = mockReports.filter(report => {
        const matchCat = activeFilter === 'all' || report.type === activeFilter;
        const matchSearch = report.title.toLowerCase().includes(search) || report.desc.toLowerCase().includes(search);
        return matchCat && matchSearch;
    });

    // Sorting Logic
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
            ? `<button onclick="deleteReport(event, ${report.id})" class="text-rose-400 hover:text-rose-600 font-bold text-[10px]">🗑 Delete</button>`
            : `<button onclick="openFlagModal(event, ${report.id})" class="text-slate-400 hover:text-rose-500 font-bold text-[10px]">🚩 Flag</button>`;

        const tagHTML = report.tags.map(t => `<span class="text-[9px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1 rounded">${t}</span>`).join('');

        list.innerHTML += `
            <div onclick="openDetailModal(${report.id})" class="bg-white dark:bg-slate-800 p-3 rounded-md shadow-sm border border-slate-200 dark:border-slate-700 hover:border-indigo-300 cursor-pointer relative">
                <div class="absolute top-3 right-3">${actionBtn}</div>
                <span class="text-[9px] font-bold ${typeColor} uppercase tracking-wider px-1.5 py-0.5 rounded border mb-1.5 inline-block">${report.type.split('/')[0]}</span>
                <h3 class="font-bold text-slate-800 dark:text-white text-xs mb-1 pr-10">${report.title}</h3>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 mb-2 line-clamp-2">${report.desc}</p>
                <div class="flex flex-wrap gap-1 mb-2">${tagHTML}</div>
                <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-2">
                    <span class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">💬 ${report.comments.length} Comments</span>
                    <div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700" onclick="event.stopPropagation()">
                        <button onclick="voteReport(event, ${report.id}, 1)" class="font-bold text-sm text-slate-400 hover:text-emerald-500">⇧</button>
                        <span class="font-bold text-xs">${report.cred}</span>
                        <button onclick="voteReport(event, ${report.id}, -1)" class="font-bold text-sm text-slate-400 hover:text-rose-500">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

// AI Tag Suggester (Restored & Improved)
function suggestTags() {
    const title = document.getElementById('report-title').value.toLowerCase();
    const cat = document.getElementById('report-category').value;
    const aiTags = document.getElementById('ai-tags');
    const container = document.getElementById('tag-container');
    
    let suggested = [];
    if(cat === 'Harassment/Aggression') suggested.push('#unsafe_vibe', '#catcalling');
    if(cat === 'Crowd/Atmosphere') suggested.push('#overcrowded', '#pickpocket');
    if(cat === 'Environmental/Path Hazards') suggested.push('#hazard', '#dark_alley');
    
    // Simulate AI reading the title
    if(title.includes('feu') || title.includes('tech')) suggested.push('#FEUTech');
    if(title.includes('ust') || title.includes('espana')) suggested.push('#UST');
    if(title.includes('sm') || title.includes('lazaro')) suggested.push('#SMSanLazaro');
    if(title.includes('dark') || title.includes('light')) suggested.push('#no_lights');

    if(suggested.length === 0) { aiTags.classList.add('hidden'); return; }
    
    aiTags.classList.remove('hidden');
    container.innerHTML = suggested.map(tag => 
        `<span class="text-[9px] font-bold bg-white text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-indigo-50" onclick="addTag('${tag}')">${tag} +</span>`
    ).join('');
}

function handleTagKeypress(e) { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }
function addCustomTag() {
    let val = document.getElementById('custom-tag-input').value.trim().replace(/\s+/g, '_');
    if(val) {
        if(!val.startsWith('#')) val = '#' + val;
        addTag(val.toLowerCase());
        document.getElementById('custom-tag-input').value = '';
    }
}
function addTag(tag) {
    if(!currentTags.includes(tag) && currentTags.length < 5) {
        currentTags.push(tag);
        document.getElementById('active-tags-container').innerHTML = currentTags.map(t => `<span class="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded flex items-center gap-1">${t} <button onclick="removeTag('${t}')" class="hover:text-rose-300 font-bold ml-1">×</button></span>`).join('');
    }
}
function removeTag(tag) { currentTags = currentTags.filter(t => t !== tag); addTag('refresh_hack'); /* forces re-render */ }


// Omitted routing and standard modal functions for brevity, keep your existing logic from previous code for nominatim/OSRM routing and toasts
function showToast(msg, type='success') { alert(msg); } // Placeholder if toast div breaks

// Submission
function submitReport() {
    const title = document.getElementById('report-title').value;
    const cat = document.getElementById('report-category').value;
    const desc = document.getElementById('report-desc').value;
    
    if(!title || !cat || desc.length < 15) return alert("Fill all fields");

    mockReports.unshift({
        id: idCounter++, type: cat, title: title, desc: desc, cred: 1, relevance: 100, timestamp: Date.now(),
        lat: manilaCenter[0] + (Math.random() - 0.5) * 0.01,
        lng: manilaCenter[1] + (Math.random() - 0.5) * 0.01,
        tags: [...currentTags], comments: [], userVote: 1, isMine: true
    });

    document.getElementById('report-modal').classList.add('hidden');
    populateHeatmap(); renderReports();
    currentTags = [];
}

function populatePartnerPortal() {
    const container = document.getElementById('city-stats-container');
    container.innerHTML = '';
    hotspots.forEach(spot => {
        const color = spot.risk > 80 ? 'bg-rose-600' : spot.risk > 60 ? 'bg-amber-500' : 'bg-emerald-500';
        container.innerHTML += `
            <div class="mb-3">
                <div class="flex justify-between text-xs mb-1 font-bold">
                    <span class="dark:text-slate-300">${spot.name}</span>
                    <span class="text-white px-1.5 rounded text-[9px] uppercase ${color}">${spot.risk > 80 ? 'High Alert' : 'Moderate'}</span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                    <div class="${color} h-2 rounded-full" style="width: ${spot.risk}%"></div>
                </div>
            </div>`;
    });
}

// Keep the rest of your portal toggle, login logic, and routing logic from the previous step!
window.onload = initMap;
