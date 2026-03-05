// Data: Heavily populated around FEU Tech (Sampaloc, Manila)
const feuCoords = { lat: 14.6042, lng: 120.9880 };

const mockReports = [
    { type: 'Environmental/Path Hazards', title: 'Broken Streetlight & Dim Alley', desc: 'The alley behind the building is pitch black at night. Makes it feel very unsafe to walk through after late classes.', cred: 145, lat: 14.6045, lng: 120.9882, user: 'Anonymous' },
    { type: 'Harassment/Aggression', title: 'Group of men catcalling', desc: 'Near the corner of Morayta and Espana. A group of men frequently loiter here and catcall students passing by.', cred: 98, lat: 14.6050, lng: 120.9890, user: 'Anonymous' },
    { type: 'Accessibility/Obstructions', title: 'Blocked PWD Ramp', desc: 'Sidewalk vendors have completely blocked the wheelchair ramp, forcing people onto the busy street.', cred: 70, lat: 14.6035, lng: 120.9875, user: 'Anonymous' },
    { type: 'Crowd/Atmosphere', title: 'Overcrowded / Pickpocket risk', desc: 'Overpass is extremely crowded during rush hour. Someone tried to open my backpack.', cred: 112, lat: 14.6028, lng: 120.9885, user: 'Anonymous' },
    { type: 'Environmental/Path Hazards', title: 'Deep open manhole', desc: 'Cover is completely missing on P. Campa street. Very dangerous especially when flooded.', cred: 210, lat: 14.6048, lng: 120.9868, user: 'Anonymous' },
    { type: 'Harassment/Aggression', title: 'Suspicious individual stalking', desc: 'Noticed someone following me from the LRT station towards Gastambide.', cred: 85, lat: 14.6020, lng: 120.9895, user: 'Anonymous' },
];

let map, heatmap;

function initMap() {
    // Fallback if Google Maps API key is missing
    if(typeof google === 'undefined') {
        document.getElementById('map').innerHTML = "<div class='p-10 text-center text-gray-500'>Google Maps failed to load. Please check your API key. (For the presentation, ensure internet connection and a valid key)</div>";
        renderReports();
        return;
    }

    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 16,
        center: feuCoords,
        mapTypeId: 'roadmap',
        styles: [ // Custom dark-ish style to make heatmap pop
            { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
            { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
        ]
    });

    const heatmapData = mockReports.map(r => ({
        location: new google.maps.LatLng(r.lat, r.lng),
        weight: r.cred / 10 // Weight by upvotes
    }));

    // Add extra random points around FEU to make the heatmap look "heavily populated"
    for(let i=0; i<50; i++) {
        heatmapData.push({
            location: new google.maps.LatLng(
                feuCoords.lat + (Math.random() - 0.5) * 0.005,
                feuCoords.lng + (Math.random() - 0.5) * 0.005
            ),
            weight: Math.random() * 5
        });
    }

    heatmap = new google.maps.visualization.HeatmapLayer({
        data: heatmapData,
        radius: 30,
        gradient: [
            'rgba(0, 255, 255, 0)', 'rgba(0, 255, 255, 1)', 'rgba(0, 191, 255, 1)',
            'rgba(0, 127, 255, 1)', 'rgba(0, 63, 255, 1)', 'rgba(0, 0, 255, 1)',
            'rgba(0, 0, 223, 1)', 'rgba(0, 0, 191, 1)', 'rgba(0, 0, 159, 1)',
            'rgba(0, 0, 127, 1)', 'rgba(63, 0, 91, 1)', 'rgba(127, 0, 63, 1)',
            'rgba(191, 0, 31, 1)', 'rgba(255, 0, 0, 1)'
        ]
    });
    heatmap.setMap(map);

    // Render left panel
    renderReports();
}

function toggleHeatmap() {
    heatmap.setMap(heatmap.getMap() ? null : map);
}

function renderReports() {
    const list = document.getElementById('reports-list');
    list.innerHTML = '';
    
    mockReports.sort((a,b) => b.cred - a.cred).forEach(report => {
        let typeColor = 'text-gray-600';
        if(report.type.includes('Harassment')) typeColor = 'text-red-600';
        if(report.type.includes('Hazards')) typeColor = 'text-orange-600';

        list.innerHTML += `
            <div class="bg-white p-4 rounded-lg shadow border border-gray-100 relative report-card group">
                <div class="flex justify-between items-start">
                    <p class="text-xs font-bold ${typeColor} uppercase tracking-wider mb-1">${report.type}</p>
                    <button class="text-gray-400 hover:text-gray-800 font-bold px-2 report-card-menu">⁝</button>
                </div>
                <h3 class="font-bold text-gray-800 text-sm mb-1">${report.title}</h3>
                <p class="text-sm text-gray-600 mb-3">${report.desc}</p>
                <div class="flex justify-between items-center border-t pt-2">
                    <div class="text-xs text-gray-400 flex items-center gap-1">
                        <span>🛡️ Cred Score</span>
                    </div>
                    <div class="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded">
                        <button class="text-green-600 hover:scale-110 transition font-bold">⇧</button>
                        <span class="font-bold text-sm text-gray-700">${report.cred}</span>
                        <button class="text-red-600 hover:scale-110 transition font-bold">⇩</button>
                    </div>
                </div>
            </div>
        `;
    });
}

// UI Toggles
function toggleSidebar() {
    const sidebar = document.getElementById('user-sidebar');
    sidebar.classList.toggle('-translate-x-full');
}

function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
    document.getElementById('report-desc').value = '';
    document.getElementById('safety-confirm').checked = false;
}

function closeEmergencyModal() {
    document.getElementById('emergency-modal').classList.add('hidden');
}

function togglePortal() {
    const portal = document.getElementById('partner-portal');
    portal.classList.toggle('hidden');
}

function loginPortal() {
    document.getElementById('portal-login').classList.add('hidden');
    document.getElementById('portal-dashboard').classList.remove('hidden');
}

// Form Logic
const descInput = document.getElementById('report-desc');
descInput.addEventListener('input', (e) => {
    document.getElementById('char-count').innerText = `${e.target.value.length}/15 min`;
});

function suggestTags() {
    const cat = document.getElementById('report-category').value;
    const aiTags = document.getElementById('ai-tags');
    const container = document.getElementById('tag-container');
    
    if(!cat) { aiTags.classList.add('hidden'); return; }
    
    aiTags.classList.remove('hidden');
    container.innerHTML = '';
    
    const tags = {
        harassment: ['#catcalling', '#stalking', '#unsafe_vibe'],
        crowd: ['#overcrowded', '#pickpocket_risk', '#loiterers'],
        environmental: ['#no_lights', '#flooded', '#blindspot'],
        accessibility: ['#blocked_ramp', '#broken_elevator']
    };
    
    tags[cat].forEach(tag => {
        container.innerHTML += `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded cursor-pointer hover:bg-blue-200 border border-blue-200" onclick="addTagToDesc('${tag}')">${tag} +</span>`;
    });
}

function addTagToDesc(tag) {
    descInput.value += ` ${tag}`;
}

// Submit Logic with Validations
function submitReport() {
    const desc = document.getElementById('report-desc').value;
    const cat = document.getElementById('report-category').value;
    const safe = document.getElementById('safety-confirm').checked;
    
    // 1. Min 15 Characters
    if(desc.length < 15) {
        alert("Description must be at least 15 characters to avoid vague reports.");
        return;
    }
    
    // 2. Category selection
    if(!cat) {
        alert("Please select a category.");
        return;
    }

    // 3. Confirm Safety
    if(!safe) {
        alert("Please confirm you are safe to post this report.");
        return;
    }

    // 4. Decency/Profanity Check (Simulated)
    const slurs = ['slur1', 'swearword', 'idiot']; // Keep clean for code
    const lowerDesc = desc.toLowerCase();
    if(slurs.some(slur => lowerDesc.includes(slur))) {
        alert("Our AI system detected inappropriate language. Please keep reports objective and clean.");
        return;
    }

    // 5. Max 3 reports per day limit (Simulated via LocalStorage)
    let reportsToday = parseInt(localStorage.getItem('reportsToday') || 0);
    let lastReportDate = localStorage.getItem('lastReportDate');
    let today = new Date().toDateString();

    if(lastReportDate !== today) {
        reportsToday = 0; // Reset if it's a new day
    }

    if(reportsToday >= 3) {
        alert("To avoid spam, you can only make 3 reports per day. Thank you for keeping the community safe!");
        return;
    }

    // Success! Update local storage
    localStorage.setItem('reportsToday', reportsToday + 1);
    localStorage.setItem('lastReportDate', today);

    // Mock adding to list
    mockReports.push({
        type: cat.toUpperCase(),
        title: 'New User Report',
        desc: desc,
        cred: 1, // Start at 1
        lat: feuCoords.lat,
        lng: feuCoords.lng,
        user: 'Anonymous'
    });

    closeReportModal();
    renderReports();
    
    // Show Emergency popup
    document.getElementById('emergency-modal').classList.remove('hidden');
}

// Call init on load (If API key fails, this handles it gracefully)
window.onload = initMap;
