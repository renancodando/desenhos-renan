const urlParams = new URLSearchParams(window.location.search);
const targetUserId = urlParams.get('id');
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

const profileAvatar = document.getElementById('profile-avatar');
const profileUsername = document.getElementById('profile-username');
const profileJoined = document.getElementById('profile-joined');
const statArtworks = document.getElementById('stat-artworks');
const statLikes = document.getElementById('stat-likes');
const galleryGrid = document.getElementById('gallery-grid');
const myProfileLink = document.getElementById('my-profile-link');
const authBtnContainer = document.getElementById('auth-btn-container');

// Navigation Logic
if (token) {
    myProfileLink.href = `profile.html?id=${currentUser.id}`;
    authBtnContainer.innerHTML = `<button class="btn btn-ghost btn-sm" onclick="logout()"><i class="fas fa-sign-out-alt"></i></button>`;
} else {
    myProfileLink.style.display = 'none';
    authBtnContainer.innerHTML = `<a href="index.html" class="btn btn-primary btn-sm">Sign In</a>`;
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

async function fetchProfile() {
    if (!targetUserId) {
        // If no ID provided, try to redirect to own profile or login
        if (currentUser.id) {
            window.location.href = `profile.html?id=${currentUser.id}`;
        } else {
            window.location.href = 'index.html';
        }
        return;
    }

    try {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`/api/users/${targetUserId}`, { headers });

        if (!res.ok) throw new Error('User not found');

        const data = await res.json();
        renderProfile(data.user, data.drawings);
    } catch (err) {
        console.error(err);
        profileUsername.textContent = 'User Not Found';
        galleryGrid.innerHTML = '';
    }
}

function renderProfile(user, drawings) {
    // Header Info
    profileUsername.textContent = user.username;
    profileAvatar.textContent = user.username.charAt(0).toUpperCase();
    profileJoined.textContent = `Joined ${new Date(user.created_at).toLocaleDateString()}`;

    // Stats
    statArtworks.textContent = drawings.length;
    const totalLikes = drawings.reduce((acc, curr) => acc + (curr.like_count || 0), 0);
    statLikes.textContent = totalLikes;

    // Gallery
    galleryGrid.innerHTML = '';

    if (drawings.length === 0) {
        galleryGrid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-gray-500">This artist hasn't published any work yet.</p>
            </div>
        `;
        return;
    }

    drawings.forEach(drawing => {
        const card = document.createElement('div');
        card.className = 'artwork-card fade-in';

        const isLiked = drawing.is_liked > 0;

        card.innerHTML = `
            <div class="artwork-image-container">
                <img src="${drawing.image_data}" alt="${drawing.title}" class="artwork-image" loading="lazy">
                <div class="artwork-overlay">
                    <a href="${drawing.image_data}" download="${drawing.title}.png" class="btn btn-icon btn-sm bg-black/50 hover:bg-black/80 text-white backdrop-blur">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            </div>
            <div class="artwork-info">
                <div>
                    <h3 class="artwork-title">${drawing.title}</h3>
                </div>
                <div class="artwork-meta">
                    <span class="text-xs text-gray-500">${new Date(drawing.created_at).toLocaleDateString()}</span>
                    <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike(this, ${drawing.id})">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span class="like-count">${drawing.like_count}</span>
                    </button>
                </div>
            </div>
        `;
        galleryGrid.appendChild(card);
    });
}

async function toggleLike(btn, drawingId) {
    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    const icon = btn.querySelector('i');
    const countSpan = btn.querySelector('.like-count');
    let count = parseInt(countSpan.textContent);
    const isLiked = btn.classList.contains('liked');

    btn.classList.toggle('liked');
    icon.classList.toggle('fas');
    icon.classList.toggle('far');

    if (isLiked) {
        count--;
    } else {
        count++;
    }
    countSpan.textContent = count;

    try {
        const res = await fetch(`/api/drawings/${drawingId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            btn.classList.toggle('liked');
            icon.classList.toggle('fas');
            icon.classList.toggle('far');
            countSpan.textContent = isLiked ? count + 1 : count - 1;
        }
    } catch (err) {
        console.error(err);
    }
}

fetchProfile();
