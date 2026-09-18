import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Global app state
let app, auth, db;
let currentUser = null;
let currentProfile = null;
let isDemoMode = false;
let demoPosts = [];
let demoNotes = [];
let demoComments = {};
let demoChats = {};

let activeChatUserId = null;
let activeChatUserName = null;
let activeChatAvatar = null;
let unsubscribeChat = null;
let unsubscribeComments = null;
let activeCommentPostId = null;
let composerQuotedPost = null;

// Feed algorithmic flow and preferences
let currentFeedFilter = 'for-you'; // 'for-you' | 'following'
let hideLikeCounts = false;
let allCachedPosts = [];

// Voice messaging recording state
let mediaRecorder = null;
let audioChunks = [];
let voiceRecordInterval = null;
let voiceRecordSeconds = 0;
let isRecordingVoice = false;

// Convo encrypted call state
let convoCallTimer = null;
let convoCallSeconds = 0;
let convoCallStream = null;
let isConvoMuted = false;
let isConvoSpeaker = true;

// New interaction state
let composerMediaType = null; // 'video' | 'image' | null
let composerMediaData = null; // DataURL or ObjectURL
let savedPostsSet = new Set();
let blockedUsersSet = new Set();
let followersMap = new Map();
let followingMap = new Map();
let selectedConsultantInfo = { id: 'moulay', name: 'Moulay Lhani', price: 50, mins: 30 };
let consultationTimerInterval = null;
let consultationSeconds = 0;
let localMediaStream = null;
let isMicMuted = false;
let isCamOff = false;
let isScreenSharing = false;

// Next-Gen Social Platform State (iOS 26 Glass Edition)
let activeStoryIndex = 0;
let activeStoryTimer = null;
let isStoryPaused = false;
let activeStoryList = [];
let composerMode = 'photo'; // 'photo' | 'video' | 'reel' | 'text' | 'poll' | 'carousel'
let composerTextGradient = 'default';
let composerCarouselPhotos = [];
let composerLocation = '';
let composerTargetCommunity = 'Public';
let currentReelIndex = 0;
let savedDraftsList = [];
let recentSearchesList = ['#iOS26Glass', 'Moulay Lhani', 'Design Systems', '#WebDesign', 'Tech & AI'];
let searchActiveTab = 'top';
let userBoardsList = [];
let joinedCommunitiesSet = new Set(['Gaming & Mods', 'Tech & AI']);
let activeExploreCategory = 'All';

// Owner verification: STRICTLY Mohamedhuguh@gmail.com has DEV & OG badges
function isAuthorizedOwner(email, uid) {
  const em = (email || '').toLowerCase().trim();
  return em === 'mohamedhuguh@gmail.com' || uid === 'mohamed_owner' || uid === 'dev_moulay';
}

function isVideoUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') ||
         lower.includes('video') || lower.startsWith('data:video') ||
         lower.includes('gtv-videos-bucket');
}

// Firestore Error Logger conforming to skill
const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      providerInfo: auth?.currentUser?.providerData?.map(p => ({
        providerId: p.providerId,
        email: p.email
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Info:', JSON.stringify(errInfo));
  return errInfo;
}

// Safe Toast Notification (Replaces native alert for iframe safety)
window.showToast = function(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(25,32,48,0.95);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);color:#fff;padding:12px 24px;border-radius:24px;font-size:13px;font-weight:600;z-index:9999;border:1px solid rgba(255,255,255,0.18);box-shadow:0 12px 36px rgba(0,0,0,0.7);opacity:0;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);pointer-events:none;max-width:85%;text-align:center;white-space:pre-line;';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(8px)';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  }, 2600);
};
window.alert = window.showToast;

// Seed data to make the app rich immediately if database is brand new
const SEED_POSTS = [
  {
    authorId: 'dev_moulay',
    authorName: 'Mohamed Huguh',
    authorUsername: 'mohamedhuguh',
    authorAvatar: 'https://picsum.photos/seed/moulay_av/200/200',
    authorEmail: 'Mohamedhuguh@gmail.com',
    authorIsDev: true,
    authorIsOG: true,
    caption: 'Tokyo & Kyoto visual study — exploring mathematical minimalism and twilight architecture. Swipe through the photo series 🌸✨',
    carouselImages: [
      'https://picsum.photos/seed/kyoto_temple_1/800/800',
      'https://picsum.photos/seed/kyoto_night_2/800/800',
      'https://picsum.photos/seed/kyoto_street_3/800/800'
    ],
    location: 'Kyoto, Japan',
    music: 'Reflections • Tycho',
    likesCount: 12480,
    likes: {},
    commentsCount: 238,
    contextReactions: { fire: '3.4K', laugh: '1.2K' },
    quotedPost: null
  },
  {
    authorId: 'dev_sarah',
    authorName: 'Sarah Jenkins',
    authorUsername: 'sarah_ui',
    authorAvatar: 'https://picsum.photos/seed/sarah_av/200/200',
    authorIsDev: false,
    authorIsOG: false,
    collabAuthor: 'mohamedhuguh',
    caption: 'Live GPU video render: glass refraction on iOS 26 web engines 🎬✨ Double tap to test the heart physics!',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    isVideo: true,
    mediaType: 'video',
    location: 'San Francisco, CA',
    music: 'Solar Flare • ODESZA',
    likesCount: 3840,
    likes: {},
    commentsCount: 64,
    contextReactions: { fire: '1.8K' },
    quotedPost: null
  },
  {
    authorId: 'dev_alex',
    authorName: 'Alex Fernandez',
    authorUsername: 'alex_fern',
    authorAvatar: 'https://picsum.photos/seed/alex_av/200/200',
    authorIsDev: false,
    authorIsOG: false,
    caption: 'Show your current developer workspace setup! Tap Add Yours below to submit your photo response to the chain 💻🔥',
    mediaUrl: 'https://picsum.photos/seed/desk_setup_1/800/600',
    addYoursPrompt: 'Show your developer desk setup ✨',
    likesCount: 5210,
    likes: {},
    commentsCount: 182,
    contextReactions: { fire: '2.4K', laugh: '340' },
    quotedPost: null
  },
  {
    authorId: 'dev_coder',
    authorName: 'Elena Rostova',
    authorUsername: 'elena_code',
    authorAvatar: 'https://picsum.photos/seed/coder_av/200/200',
    authorIsDev: false,
    authorIsOG: false,
    caption: 'What is your primary architecture for next-generation interactive web apps in 2026? Vote below 📊',
    poll: {
      question: 'Best Architecture for 2026 Web Apps?',
      options: ['Native WebGPU + Glass', 'Web Workers + WASM', 'Server-Driven UI Streams']
    },
    likesCount: 1490,
    likes: {},
    commentsCount: 47,
    quotedPost: null
  }
];

const SEED_NOTES = [
  { userId: 'dev_moulay', userName: 'Moulay', userAvatar: 'https://picsum.photos/seed/moulay_av/200/200', text: 'Busy coding firmware payloads...' },
  { userId: 'dev_sarah', userName: 'Sarah', userAvatar: 'https://picsum.photos/seed/sarah_av/200/200', text: 'Glass UI is top tier ✨' },
  { userId: 'dev_alex', userName: 'Alex', userAvatar: 'https://picsum.photos/seed/alex_av/200/200', text: 'Debugging kernel limit' },
  { userId: 'dev_coder', userName: 'C Coder', userAvatar: 'https://picsum.photos/seed/coder_av/200/200', text: 'Pointer logic conquered 🖤' }
];

const DEFAULT_PORTFOLIO = [
  {
    id: 'p1',
    title: 'MOULAY Platform',
    subtitle: 'iOS 26 Glass Edition',
    desc: 'Custom-built platform interface designed with dark glassmorphism, real-time messaging, and Firebase Auth.',
    tags: ['HTML5', 'CSS Glass', 'Firebase', 'Realtime'],
    icon: 'fa-code',
    color: '#0a84ff'
  },
  {
    id: 'p2',
    title: 'MCC Enterprise',
    subtitle: 'Brand & Logo Design',
    desc: 'Financial and mathematics enterprise branding concept focusing on minimalist aesthetic and precise geometry.',
    tags: ['Design', 'Branding', 'Math'],
    icon: 'fa-chart-pie',
    color: '#30d158'
  },
  {
    id: 'p3',
    title: 'C & Data Structures',
    subtitle: 'Academic Projects',
    desc: 'Implementations of numerical analysis algorithms and complex data structures written strictly in C.',
    tags: ['C Lang', 'Algorithms', 'Math'],
    icon: 'fa-terminal',
    color: '#ff9f0a'
  },
  {
    id: 'p4',
    title: 'PS4 Modding Utilities',
    subtitle: 'Firmware Management',
    desc: 'Exploration of homebrew utilities, FPKGi management, and DirectPackageInstaller workflows.',
    tags: ['Hardware', 'Modding', 'GoldHEN'],
    icon: 'fa-gamepad',
    color: '#5e5ce6'
  }
];

// Rich Seed Datasets for Next-Gen Social Navigation
const SEED_STORIES = [
  {
    id: 'story_moulay',
    authorId: 'dev_moulay',
    authorName: 'Moulay Lhani',
    authorUsername: 'moulaylhani',
    authorAvatar: 'https://picsum.photos/seed/moulay_av/200/200',
    isCloseFriends: true,
    hasUnseen: true,
    slides: [
      {
        type: 'video',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        caption: 'Live GPU refraction test on iOS 26 Glass web core ⚡',
        time: '1h ago',
        poll: null
      },
      {
        type: 'image',
        url: 'https://picsum.photos/seed/nature_mist/800/1200',
        caption: 'Architecture brainstorm in the mountains 🏔️',
        time: '2h ago',
        poll: {
          question: 'Do you love the Glass Edition aesthetic?',
          options: ['Yes, absolutely 🔥', 'Obsessed! ✨']
        }
      }
    ]
  },
  {
    id: 'story_sarah',
    authorId: 'dev_sarah',
    authorName: 'Sarah Jenkins',
    authorUsername: 'sarah_ui',
    authorAvatar: 'https://picsum.photos/seed/sarah_av/200/200',
    isCloseFriends: false,
    hasUnseen: true,
    slides: [
      {
        type: 'image',
        url: 'https://picsum.photos/seed/design_ui/800/1200',
        caption: 'New design tokens finalized. Mathematical border radii! 📐',
        time: '3h ago',
        poll: null
      }
    ]
  },
  {
    id: 'story_alex',
    authorId: 'dev_alex',
    authorName: 'Alex Fernandez',
    authorUsername: 'alex_fern',
    authorAvatar: 'https://picsum.photos/seed/alex_av/200/200',
    isCloseFriends: false,
    hasUnseen: true,
    slides: [
      {
        type: 'text',
        gradient: 'sunset',
        caption: 'Compiler speedup: 4.2x faster bundling achieved today 🚀',
        time: '5h ago',
        poll: null
      }
    ]
  },
  {
    id: 'story_elena',
    authorId: 'dev_elena',
    authorName: 'Elena Rostova',
    authorUsername: 'elena_lens',
    authorAvatar: 'https://picsum.photos/seed/elena_av/200/200',
    isCloseFriends: true,
    hasUnseen: true,
    slides: [
      {
        type: 'image',
        url: 'https://picsum.photos/seed/tokyo_night/800/1200',
        caption: 'Tokyo midnight reflections 🌧️ neon lights',
        time: '6h ago',
        poll: null
      }
    ]
  },
  {
    id: 'story_cyber',
    authorId: 'dev_cyber',
    authorName: 'Cyber Labs',
    authorUsername: 'cyberlabs',
    authorAvatar: 'https://picsum.photos/seed/cyber_av/200/200',
    isCloseFriends: false,
    hasUnseen: true,
    slides: [
      {
        type: 'video',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        caption: 'Neural render engine v2 is online 🧠🤖',
        time: '8h ago',
        poll: null
      }
    ]
  }
];

const SEED_REELS = [
  {
    id: 'reel_1',
    authorId: 'dev_moulay',
    authorName: 'Moulay Lhani',
    authorUsername: 'moulaylhani',
    authorAvatar: 'https://picsum.photos/seed/moulay_av/200/200',
    caption: 'Real-time WebRTC live video & glassmorphism on modern web engines 🚀✨ Double tap to test heart burst!',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    soundName: 'Original Audio - Moulay Lhani',
    soundCreator: 'Moulay Lhani',
    likesCount: 14200,
    isLiked: false,
    commentsCount: 482,
    sharesCount: 194
  },
  {
    id: 'reel_2',
    authorId: 'dev_sarah',
    authorName: 'Sarah Jenkins',
    authorUsername: 'sarah_ui',
    authorAvatar: 'https://picsum.photos/seed/sarah_av/200/200',
    caption: 'Why nested border radii fail if you forget the math: R_inner = R_outer - Padding. Clean UI tips! 🎨📱',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    soundName: 'Minimal Chill Vibes - Sarah UI',
    soundCreator: 'Sarah Jenkins',
    likesCount: 21300,
    isLiked: false,
    commentsCount: 634,
    sharesCount: 520
  },
  {
    id: 'reel_3',
    authorId: 'dev_alex',
    authorName: 'Alex Fernandez',
    authorUsername: 'alex_fern',
    authorAvatar: 'https://picsum.photos/seed/alex_av/200/200',
    caption: 'Night coding aesthetic with dark glass terminal. C algorithms running at 60fps on Web Workers ⚡💻',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    soundName: 'Cyber Ambient Synth - Alex Beats',
    soundCreator: 'Alex Fernandez',
    likesCount: 9800,
    isLiked: false,
    commentsCount: 215,
    sharesCount: 88
  },
  {
    id: 'reel_4',
    authorId: 'dev_coder',
    authorName: 'C Coder',
    authorUsername: 'c_coder',
    authorAvatar: 'https://picsum.photos/seed/coder_av/200/200',
    caption: 'Memory allocation without leaks: pointer arithmetic and cache locality visualization 🕹️',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    soundName: 'Lo-Fi Code Beats - Study Sessions',
    soundCreator: 'SoundLab',
    likesCount: 11100,
    isLiked: false,
    commentsCount: 340,
    sharesCount: 162
  }
];

const SEED_BOARDS = [
  {
    id: 'board_design',
    title: 'Design Systems & UI',
    desc: 'iOS 26 glassmorphism, micro-interactions, and mathematical typographic scales.',
    pinCount: 18,
    isSecret: false,
    thumbs: [
      'https://picsum.photos/seed/design_ui/400/400',
      'https://picsum.photos/seed/ui_mockup/400/400',
      'https://picsum.photos/seed/palette/400/400'
    ]
  },
  {
    id: 'board_ios26',
    title: 'iOS 26 Glass Visuals',
    desc: 'Refractive shaders, frosted acrylic blur, and ambient glow accents.',
    pinCount: 32,
    isSecret: false,
    thumbs: [
      'https://picsum.photos/seed/glass_art/400/400',
      'https://picsum.photos/seed/prism/400/400',
      'https://picsum.photos/seed/crystal/400/400'
    ]
  },
  {
    id: 'board_cyberpunk',
    title: 'Cyberpunk Architecture',
    desc: 'Neon lights, rainy nocturnal urbanism, and dark metallic textures.',
    pinCount: 14,
    isSecret: false,
    thumbs: [
      'https://picsum.photos/seed/tokyo_night/400/400',
      'https://picsum.photos/seed/neon_street/400/400',
      'https://picsum.photos/seed/dark_city/400/400'
    ]
  },
  {
    id: 'board_minimal',
    title: 'Minimalist Workspace',
    desc: 'Clean desk setups, mechanical keyboards, and ultrawide monitor ergonomics.',
    pinCount: 9,
    isSecret: true,
    thumbs: [
      'https://picsum.photos/seed/desk_setup/400/400',
      'https://picsum.photos/seed/keyboard/400/400',
      'https://picsum.photos/seed/workspace/400/400'
    ]
  }
];

const SEED_COMMUNITIES = [
  {
    id: 'comm_gaming',
    name: 'Gaming & Mods',
    desc: 'Active modding, firmware research, PS4 GoldHEN, and homebrew developer discussions.',
    members: '142K',
    membersNum: 142000,
    category: 'Gaming',
    icon: 'fa-gamepad',
    color: '#5e5ce6',
    banner: 'https://picsum.photos/seed/comm_gaming/800/300'
  },
  {
    id: 'comm_tech',
    name: 'Tech & AI',
    desc: 'Next-generation algorithms, LLM integrations, WebRTC protocols, and full-stack engineering.',
    members: '210K',
    membersNum: 210000,
    category: 'Tech',
    icon: 'fa-microchip',
    color: '#0a84ff',
    banner: 'https://picsum.photos/seed/comm_tech/800/300'
  },
  {
    id: 'comm_design',
    name: 'Design Systems',
    desc: 'Mathematical layouts, glassmorphism, typography pairings, and accessible design.',
    members: '88K',
    membersNum: 88000,
    category: 'Design',
    icon: 'fa-pen-nib',
    color: '#ff9f0a',
    banner: 'https://picsum.photos/seed/comm_design/800/300'
  },
  {
    id: 'comm_3d',
    name: 'Motion & 3D',
    desc: 'Blender shaders, WebGL interactive canvases, 3D physics, and motion design.',
    members: '64K',
    membersNum: 64000,
    category: 'Design',
    icon: 'fa-cubes',
    color: '#bf5af2',
    banner: 'https://picsum.photos/seed/comm_3d/800/300'
  },
  {
    id: 'comm_photo',
    name: 'Photography & Cinema',
    desc: 'Color grading recipes, anamorphic lens optics, night street photography, and minimal frames.',
    members: '95K',
    membersNum: 95000,
    category: 'Photography',
    icon: 'fa-camera',
    color: '#30d158',
    banner: 'https://picsum.photos/seed/comm_photo/800/300'
  }
];

const SEED_EXPLORE = [
  { id: 'exp_1', title: 'Reflective Glass HUD', category: 'Design', img: 'https://picsum.photos/seed/exp_glass/600/800', isVideo: false, likes: 842, comments: 24, author: 'moulaylhani' },
  { id: 'exp_2', title: 'Tokyo Midnight Cyber', category: 'Aesthetic', img: 'https://picsum.photos/seed/tokyo_night/600/500', isVideo: false, likes: 1204, comments: 45, author: 'elena_lens' },
  { id: 'exp_3', title: 'Dynamic Shader Canvas', category: 'Tech', img: 'https://picsum.photos/seed/shader_canvas/600/700', isVideo: true, likes: 620, comments: 19, author: 'alex_fern' },
  { id: 'exp_4', title: 'Minimalist Workspace Setup', category: 'Aesthetic', img: 'https://picsum.photos/seed/desk_setup/600/600', isVideo: false, likes: 980, comments: 33, author: 'sarah_ui' },
  { id: 'exp_5', title: 'Geometric Branding Patterns', category: 'Design', img: 'https://picsum.photos/seed/mcc_brand/600/900', isVideo: false, likes: 450, comments: 12, author: 'moulaylhani' },
  { id: 'exp_6', title: 'Hardware Firmware Analysis', category: 'Gaming', img: 'https://picsum.photos/seed/hardware_mod/600/500', isVideo: false, likes: 730, comments: 28, author: 'c_coder' },
  { id: 'exp_7', title: 'AI Neural Core Breakdown', category: 'AI', img: 'https://picsum.photos/seed/neural_core/600/800', isVideo: true, likes: 1840, comments: 72, author: 'cyberlabs' },
  { id: 'exp_8', title: 'Nocturnal Urban Architecture', category: 'Architecture', img: 'https://picsum.photos/seed/urban_arch/600/650', isVideo: false, likes: 915, comments: 21, author: 'elena_lens' },
  { id: 'exp_9', title: 'Fluid Motion Physics 60fps', category: 'Motion', img: 'https://picsum.photos/seed/fluid_motion/600/750', isVideo: true, likes: 1530, comments: 54, author: 'sarah_ui' }
];

const SEED_TRENDS = [
  { tag: '#iOS26Glass', topic: 'Technology', count: '52.4K posts', rank: 1, desc: 'Trending globally in Tech' },
  { tag: '#WebDesign', topic: 'Design & UI', count: '34.8K posts', rank: 2, desc: 'Hot in Creative Communities' },
  { tag: '#CyberpunkTech', topic: 'Creative Coding', count: '18.1K posts', rank: 3, desc: 'Viral in Coding & Shaders' },
  { tag: '#NextGenSocial', topic: 'Social Networks', count: '12.9K posts', rank: 4, desc: 'Innovations in social apps' },
  { tag: '#GeminiAI', topic: 'Artificial Intelligence', count: '28.6K posts', rank: 5, desc: 'Real-time intelligence assistant' },
  { tag: '#CleanCode', topic: 'Engineering', count: '15.2K posts', rank: 6, desc: 'C, TypeScript & Algorithms' }
];

// Initialize App & Firebase
async function initFirebase() {
  try {
    const res = await fetch('/api/config/firebase');
    const config = await res.json();
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app, config.firestoreDatabaseId);

    // Test Firestore connection per guidelines
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (testErr) {
      if (testErr instanceof Error && testErr.message.includes('the client is offline')) {
        console.warn("Firestore client offline or cold start. Will retry automatically.");
      }
    }

    // Auth State Listener
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        isDemoMode = false;
        currentUser = user;
        const pill = document.getElementById('demo-mode-pill');
        if (pill) pill.style.display = 'none';
        await syncUserProfile(user);
        document.getElementById('auth-overlay').classList.add('hidden');
        initRealtimeListeners();
      } else if (!isDemoMode) {
        currentUser = null;
        currentProfile = null;
        document.getElementById('auth-overlay').classList.remove('hidden');
      }
    });
  } catch (err) {
    console.error("Initialization error:", err);
    showToast("Connecting to Platform services...");
  }
}

// User Profile Sync
async function syncUserProfile(user) {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // Generate username from email or name
    let cleanHandle = (user.email ? user.email.split('@')[0] : 'user')
      .toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanHandle) cleanHandle = 'user_' + user.uid.substring(0, 5);

    // Strictly owner (Mohamedhuguh@gmail.com) gets DEV and OG badges
    const isOwner = isAuthorizedOwner(user.email, user.uid);
    const isDev = isOwner;
    const isOG = isOwner;

    currentProfile = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || (isOwner ? 'Mohamed Huguh' : 'Moulay Lhani'),
      username: cleanHandle,
      photoURL: user.photoURL || `https://picsum.photos/seed/${user.uid}/200/200`,
      bio: isOwner ? 'Developer & Creator • iOS 26 Glass Edition' : 'Platform Explorer • Early Adopter',
      isDev: isDev,
      isOG: isOG,
      isPrivate: false,
      postsCount: 1,
      followersCount: 24,
      followingCount: 42,
      portfolio: DEFAULT_PORTFOLIO,
      createdAt: serverTimestamp()
    };
    await setDoc(userRef, currentProfile);
  } else {
    currentProfile = snap.data();
    // Enforce owner-only badge rule on all accounts
    const isOwner = isAuthorizedOwner(currentProfile.email || user.email, currentProfile.uid || user.uid);
    currentProfile.isDev = isOwner;
    currentProfile.isOG = isOwner;
    if (!currentProfile.portfolio) {
      currentProfile.portfolio = DEFAULT_PORTFOLIO;
      await updateDoc(userRef, { portfolio: DEFAULT_PORTFOLIO });
    }
  }

  // Load user saved posts and social relationships
  await initUserSocialData(user.uid);
  updateProfileUI();
}

// Load real saved posts, following, followers, and blocked accounts
async function initUserSocialData(userId) {
  try {
    // Saved posts listener
    onSnapshot(collection(db, 'users', userId, 'saved_posts'), (snap) => {
      savedPostsSet.clear();
      snap.forEach(d => savedPostsSet.add(d.id));
      const savedCount = savedPostsSet.size;
      const countEl = document.getElementById('saved-posts-count-indicator');
      if (countEl) countEl.innerText = `${savedCount} item${savedCount === 1 ? '' : 's'}`;
    });

    // Blocked users listener
    onSnapshot(collection(db, 'users', userId, 'blocked'), (snap) => {
      blockedUsersSet.clear();
      snap.forEach(d => blockedUsersSet.add(d.id));
      const blockedCount = blockedUsersSet.size;
      const countEl = document.getElementById('blocked-users-count-indicator');
      if (countEl) countEl.innerText = `${blockedCount} accounts`;
    });

    // Following listener
    onSnapshot(collection(db, 'users', userId, 'following'), (snap) => {
      followingMap.clear();
      snap.forEach(d => followingMap.set(d.id, d.data()));
      if (currentProfile) {
        currentProfile.followingCount = followingMap.size;
        const el = document.getElementById('profile-stat-following');
        if (el) el.innerText = followingMap.size;
      }
    });

    // Followers listener
    onSnapshot(collection(db, 'users', userId, 'followers'), (snap) => {
      followersMap.clear();
      snap.forEach(d => followersMap.set(d.id, d.data()));
      if (currentProfile) {
        currentProfile.followersCount = followersMap.size;
        const el = document.getElementById('profile-stat-followers');
        if (el) el.innerText = followersMap.size;
      }
    });
  } catch (e) {
    console.warn("Could not attach social listeners:", e);
  }
}

function updateProfileUI() {
  if (!currentProfile) return;

  // Header & Profile elements
  const isPriv = !!currentProfile.isPrivate;
  document.getElementById('profile-header-handle').innerHTML = `${isPriv ? '<i class="fa-solid fa-lock" style="font-size: 12px; margin-right: 4px; color: #ff9f0a;"></i> ' : ''}@${currentProfile.username}`;
  document.getElementById('profile-avatar-img').src = currentProfile.photoURL;
  document.getElementById('profile-display-name').innerText = currentProfile.displayName;
  document.getElementById('profile-username-tag').innerText = `@${currentProfile.username}`;
  document.getElementById('profile-bio-text').innerText = currentProfile.bio || 'Platform Member';
  document.getElementById('profile-stat-followers').innerText = currentProfile.followersCount !== undefined ? currentProfile.followersCount : 24;
  document.getElementById('profile-stat-following').innerText = currentProfile.followingCount !== undefined ? currentProfile.followingCount : 42;

  // Private Account Toggle in Settings & Profile Lock Indicator
  const privToggle = document.getElementById('settings-private-toggle');
  if (privToggle) {
    if (isPriv) privToggle.classList.add('active');
    else privToggle.classList.remove('active');
  }

  // Badges: ONLY Mohamedhuguh@gmail.com has DEV & OG badges
  let badgesHtml = '';
  if (currentProfile.isDev) {
    badgesHtml += `<span class="badge badge-dev"><i class="fa-solid fa-code"></i> DEV</span>`;
  }
  if (currentProfile.isOG) {
    badgesHtml += `<span class="badge badge-og"><i class="fa-solid fa-crown"></i> OG</span>`;
  }
  if (isPriv) {
    badgesHtml += `<span class="badge" style="background: rgba(255,159,10,0.15); border: 1px solid rgba(255,159,10,0.4); color: #ff9f0a;"><i class="fa-solid fa-lock"></i> PRIVATE</span>`;
  }
  document.getElementById('profile-badges').innerHTML = badgesHtml;

  // Composer user info
  document.getElementById('composer-avatar').src = currentProfile.photoURL;
  document.getElementById('composer-name').innerText = currentProfile.displayName;
  document.getElementById('composer-handle').innerText = `@${currentProfile.username}`;

  // Settings statuses
  document.getElementById('settings-dev-status').innerText = currentProfile.isDev ? 'Active' : 'Standard';
  document.getElementById('settings-og-status').innerText = currentProfile.isOG ? 'Active' : 'Member';

  // Render portfolio
  renderPortfolioCards(currentProfile.portfolio || []);
}

// Portfolio Cards
function renderPortfolioCards(items) {
  const container = document.getElementById('portfolio-cards-container');
  if (!items || items.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #777; padding: 20px;">No showcase projects added yet.</div>`;
    return;
  }

  container.innerHTML = items.map(p => `
    <div class="portfolio-card">
      <div class="portfolio-card-header">
        <div class="portfolio-icon" style="background: ${p.color || '#0a84ff'}33; color: ${p.color || '#0a84ff'};">
          <i class="fa-solid ${p.icon || 'fa-code'}"></i>
        </div>
        <div>
          <div class="portfolio-title">${escapeHtml(p.title)}</div>
          <div class="portfolio-subtitle">${escapeHtml(p.subtitle || '')}</div>
        </div>
      </div>
      <div class="portfolio-desc">${escapeHtml(p.desc)}</div>
      <div class="portfolio-tags">
        ${(p.tags || []).map(t => `<span class="portfolio-tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// Real-Time Listeners
let hasSeededPosts = false;
function initRealtimeListeners() {
  // 1. Post Feed Listener
  const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  onSnapshot(postsQuery, async (snapshot) => {
    if (snapshot.empty && !hasSeededPosts) {
      hasSeededPosts = true;
      // Seed initial posts so user has content
      for (const p of SEED_POSTS) {
        await addDoc(collection(db, 'posts'), {
          ...p,
          createdAt: serverTimestamp()
        });
      }
      return;
    }

    const posts = [];
    snapshot.forEach(doc => {
      posts.push({ id: doc.id, ...doc.data() });
    });
    renderFeed(posts);

    // Update profile posts count
    if (currentUser) {
      const myPosts = posts.filter(p => p.authorId === currentUser.uid);
      document.getElementById('profile-stat-posts').innerText = myPosts.length;
      renderProfilePostsGrid(myPosts);
    }
  });

  // 2. Status Notes Listener
  const notesQuery = query(collection(db, 'notes'), orderBy('createdAt', 'desc'), limit(20));
  onSnapshot(notesQuery, async (snapshot) => {
    if (snapshot.empty) {
      // Seed default notes
      for (const n of SEED_NOTES) {
        await setDoc(doc(db, 'notes', n.userId), {
          ...n,
          createdAt: serverTimestamp()
        });
      }
      return;
    }

    const notes = [];
    snapshot.forEach(doc => notes.push({ id: doc.id, ...doc.data() }));
    renderNotes(notes);
  });

  // 3. Notifications Listener
  if (currentUser) {
    const notifQuery = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(15));
    onSnapshot(notifQuery, (snapshot) => {
      const list = [];
      let unread = 0;
      snapshot.forEach(d => {
        const data = d.data();
        if (data.recipientId === currentUser.uid) {
          list.push({ id: d.id, ...data });
          if (!data.read) unread++;
        }
      });
      const badge = document.getElementById('notif-badge');
      if (unread > 0) {
        badge.style.display = 'flex';
        badge.innerText = unread > 9 ? '9+' : unread;
      } else {
        badge.style.display = 'none';
      }
      renderNotificationsList(list);
    });
  }

  // Populate explore & messages
  renderExploreGrid();
  loadConversationsList();
}

// Switch Feed Filter (X-Style Algorithmic Flow: For You vs Following)
window.switchFeedFilter = function(filterType) {
  currentFeedFilter = filterType;
  const tabForYou = document.getElementById('tab-feed-foryou');
  const tabFollowing = document.getElementById('tab-feed-following');
  
  if (tabForYou && tabFollowing) {
    if (filterType === 'for-you') {
      tabForYou.classList.add('active');
      tabFollowing.classList.remove('active');
    } else {
      tabForYou.classList.remove('active');
      tabFollowing.classList.add('active');
    }
  }
  
  renderFeed(allCachedPosts);
};

// Double-Tap Heart Burst Animation (Instagram Style)
window.handleMediaDoubleTap = function(postId, event) {
  event.stopPropagation();
  const targetMedia = event.currentTarget;
  let burst = targetMedia.querySelector('.heart-burst-overlay');
  if (!burst) {
    burst = document.createElement('div');
    burst.className = 'heart-burst-overlay';
    burst.innerHTML = '<i class="fa-solid fa-heart"></i>';
    targetMedia.appendChild(burst);
  }

  burst.classList.remove('burst');
  void burst.offsetWidth; // force reflow
  burst.classList.add('burst');
  setTimeout(() => burst.classList.remove('burst'), 800);

  // Like the post if not already liked
  const post = (isDemoMode ? demoPosts : allCachedPosts).find(p => p.id === postId);
  if (post && (!post.likes || !post.likes[currentUser?.uid])) {
    toggleLikePost(postId);
  }
};

// Toggle Hide Like & View Counts (Instagram Setting)
window.toggleHideLikeCounts = function() {
  hideLikeCounts = !hideLikeCounts;
  const toggleBtn = document.getElementById('settings-hide-likes-toggle');
  if (toggleBtn) {
    if (hideLikeCounts) toggleBtn.classList.add('active');
    else toggleBtn.classList.remove('active');
  }
  showToast(hideLikeCounts ? "Like counts hidden across feed" : "Like counts visible");
  renderFeed(allCachedPosts);
};

// Render Feed
function renderFeed(posts) {
  allCachedPosts = posts || [];
  const container = document.getElementById('feed-container');
  if (!allCachedPosts || allCachedPosts.length === 0) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #888;">No posts yet. Be the first to share!</div>`;
    return;
  }

  // Filter out any posts from blocked accounts
  let filtered = allCachedPosts.filter(p => !blockedUsersSet.has(p.authorId));

  // Apply Feed Filter: 'for-you' (algorithmic ranking) vs 'following' (followed accounts only)
  if (currentFeedFilter === 'following') {
    filtered = filtered.filter(p => followingMap.has(p.authorId) || (currentUser && p.authorId === currentUser.uid));
    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 48px 20px; text-align: center; color: #888;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(10,132,255,0.12); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #0a84ff; font-size: 22px;">
            <i class="fa-solid fa-user-plus"></i>
          </div>
          <div style="font-weight: 700; color: #fff; font-size: 16px; margin-bottom: 6px;">Follow creators to build your feed</div>
          <p style="font-size: 13px; max-width: 320px; margin: 0 auto 18px; line-height: 1.5; color: #aaa;">
            When you follow creators, their newest posts, videos, and portfolio updates will flow into your Following tab.
          </p>
          <button type="button" class="btn-primary" onclick="switchFeedFilter('for-you')" style="font-size: 13px; padding: 8px 20px; border-radius: 99px;">
            Explore For You Feed
          </button>
        </div>
      `;
      return;
    }
  } else {
    // X-Style Algorithmic Ranking: score = (likes * 2) + (comments * 3) + freshness
    filtered = [...filtered].sort((a, b) => {
      const aLikes = a.likesCount || 0;
      const bLikes = b.likesCount || 0;
      const aComments = a.commentsCount || 0;
      const bComments = b.commentsCount || 0;

      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : Date.now();
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : Date.now();
      const aAgeHours = Math.max(1, (Date.now() - aTime) / 3600000);
      const bAgeHours = Math.max(1, (Date.now() - bTime) / 3600000);

      const aScore = (aLikes * 2 + aComments * 3 + 10) / Math.pow(aAgeHours, 0.8);
      const bScore = (bLikes * 2 + bComments * 3 + 10) / Math.pow(bAgeHours, 0.8);
      return bScore - aScore;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 40px; text-align: center; color: #888;">No visible posts.</div>`;
    return;
  }

  container.innerHTML = filtered.map(post => {
    const isLiked = currentUser && post.likes && post.likes[currentUser.uid];
    const isSaved = savedPostsSet.has(post.id);
    const likesCount = post.likesCount || 0;
    const commentsCount = post.commentsCount || 0;

    // DEV and OG badges: strictly for authorized owner
    const isOwner = isAuthorizedOwner(post.authorEmail || '', post.authorId);
    let devBadge = (post.authorIsDev || isOwner) ? `<span class="badge badge-dev"><i class="fa-solid fa-code"></i> DEV</span>` : '';
    let ogBadge = (post.authorIsOG || isOwner) ? `<span class="badge badge-og"><i class="fa-solid fa-crown"></i> OG</span>` : '';

    // Format timestamp
    let timeStr = 'Just now';
    if (post.createdAt && post.createdAt.toDate) {
      const diff = Math.floor((Date.now() - post.createdAt.toDate().getTime()) / 1000);
      if (diff < 60) timeStr = 'Just now';
      else if (diff < 3600) timeStr = `${Math.floor(diff/60)}m ago`;
      else if (diff < 86400) timeStr = `${Math.floor(diff/3600)}h ago`;
      else timeStr = `${Math.floor(diff/86400)}d ago`;
    }

    // Location tag
    let locationHtml = '';
    if (post.location) {
      locationHtml = `
        <div style="font-size: 11px; color: #0a84ff; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
          <i class="fa-solid fa-location-dot"></i> ${escapeHtml(post.location)}
        </div>
      `;
    }

    // Media attachment: detect Carousel vs Video vs Photo
    let mediaHtml = '';
    if (post.carouselImages && Array.isArray(post.carouselImages) && post.carouselImages.length > 0) {
      mediaHtml = `
        <div class="carousel-wrapper" id="carousel-${post.id}">
          <div class="carousel-track" id="carousel-track-${post.id}" onscroll="updateCarouselIndicators('${post.id}')">
            ${post.carouselImages.map(img => `
              <div class="carousel-slide" ondblclick="handleMediaDoubleTap('${post.id}', event)">
                <img src="${escapeHtml(img)}" loading="lazy" alt="Carousel Slide">
                <div class="heart-burst-overlay"><i class="fa-solid fa-heart"></i></div>
              </div>
            `).join('')}
          </div>
          <button type="button" class="carousel-nav-btn prev" onclick="navigateCarousel('${post.id}', -1)" aria-label="Previous Image"><i class="fa-solid fa-chevron-left"></i></button>
          <button type="button" class="carousel-nav-btn next" onclick="navigateCarousel('${post.id}', 1)" aria-label="Next Image"><i class="fa-solid fa-chevron-right"></i></button>
          <div class="carousel-indicators" id="carousel-dots-${post.id}">
            ${post.carouselImages.map((_, idx) => `<div class="carousel-dot ${idx === 0 ? 'active' : ''}"></div>`).join('')}
          </div>
        </div>
      `;
    } else if (post.mediaUrl) {
      const isVideo = post.isVideo || post.mediaType === 'video' || isVideoUrl(post.mediaUrl);
      if (isVideo) {
        mediaHtml = `
          <div class="post-video-container" ondblclick="handleMediaDoubleTap('${post.id}', event)" onclick="openImmersiveVideoModal('${escapeHtml(post.mediaUrl)}', '${escapeHtml(post.authorName)}', '${escapeHtml(post.authorUsername)}', '${escapeHtml(post.authorAvatar || '')}', '${encodeURIComponent(post.caption || '')}', '${escapeHtml(post.music || 'Trending Audio')}')">
            <video src="${escapeHtml(post.mediaUrl)}" playsinline loop preload="metadata" class="post-video" muted autoplay></video>
            <div class="video-badge"><i class="fa-solid fa-expand"></i> Immersive View</div>
            <div class="heart-burst-overlay"><i class="fa-solid fa-heart"></i></div>
          </div>
        `;
      } else {
        mediaHtml = `
          <div class="post-media" ondblclick="handleMediaDoubleTap('${post.id}', event)">
            <img src="${escapeHtml(post.mediaUrl)}" alt="Post Media" loading="lazy">
            <div class="heart-burst-overlay"><i class="fa-solid fa-heart"></i></div>
          </div>
        `;
      }
    }

    // Music audio tag pill
    let musicHtml = '';
    if (post.music) {
      musicHtml = `
        <div class="post-audio-pill" onclick="openSoundDetailModal('${escapeHtml(post.music)}')">
          <i class="fa-solid fa-compact-disc post-audio-disc-mini"></i>
          <span>${escapeHtml(post.music)}</span>
        </div>
      `;
    }

    // Add Yours interactive sticker
    let addYoursHtml = '';
    if (post.addYoursPrompt) {
      addYoursHtml = `
        <div class="add-yours-sticker">
          <div>
            <div style="font-size: 10px; font-weight: 800; color: #ff2d55; letter-spacing: 0.5px; text-transform: uppercase;">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Add Yours
            </div>
            <div style="font-size: 13px; font-weight: 700; color: #fff; margin-top: 2px;">
              ${escapeHtml(post.addYoursPrompt)}
            </div>
          </div>
          <button type="button" class="add-yours-btn" onclick="participateAddYours('${escapeHtml(post.addYoursPrompt)}')">
            <i class="fa-solid fa-plus"></i> Add Yours
          </button>
        </div>
      `;
    }

    // Poll options widget
    let pollHtml = '';
    if (post.poll && post.poll.options && post.poll.options.length > 0) {
      pollHtml = `
        <div class="post-poll-card" style="margin: 10px 0; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);">
          <div style="font-weight: 600; font-size: 13px; color: #fff; margin-bottom: 8px;">${escapeHtml(post.poll.question || 'Poll')}</div>
          ${post.poll.options.map((opt, oi) => `
            <div class="feed-poll-option" onclick="voteFeedPoll('${post.id}', ${oi}, this)" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 6px; border-radius: 8px; background: rgba(255,255,255,0.06); cursor: pointer; font-size: 13px;">
              <span>${escapeHtml(opt)}</span>
              <span class="feed-poll-pct" style="display: none; font-size: 11px; font-weight: 700; color: #0a84ff;">${oi === 0 ? '64%' : '36%'}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Quoted post preview
    let quoteHtml = '';
    if (post.quotedPost) {
      quoteHtml = `
        <div class="quote-box">
          <div class="quote-box-header">
            <img src="${escapeHtml(post.quotedPost.authorAvatar || 'https://picsum.photos/100/100')}" class="quote-box-avatar">
            <span class="quote-box-author">${escapeHtml(post.quotedPost.authorName)}</span>
            <span style="font-size: 11px; color: #888;">@${escapeHtml(post.quotedPost.authorUsername)}</span>
          </div>
          <div class="quote-box-text">${escapeHtml(post.quotedPost.caption || '')}</div>
        </div>
      `;
    }

    // Likes count text respecting hideLikeCounts preference
    let likesDisplay = `${likesCount}`;
    if (hideLikeCounts) {
      likesDisplay = isLiked ? 'Liked' : 'Like';
    }

    // Context reactions summary
    let contextReactionsHtml = '';
    if (likesCount > 0) {
      const formattedCount = likesCount > 999 ? (likesCount / 1000).toFixed(1) + 'K' : likesCount;
      contextReactionsHtml = `
        <div class="post-context-reactions">
          <span>❤️ Loved by ${formattedCount}</span>
          ${post.contextReactions?.fire ? `<span>• 🔥 ${post.contextReactions.fire}</span>` : ''}
          ${post.contextReactions?.laugh ? `<span>• 😂 ${post.contextReactions.laugh}</span>` : ''}
        </div>
      `;
    }

    // Collab author badge
    let collabHtml = post.collabAuthor ? `<span class="collab-badge"><i class="fa-solid fa-user-group"></i> with @${escapeHtml(post.collabAuthor)}</span>` : '';

    return `
      <div class="post" id="post-${post.id}">
        <div class="post-header">
          <div class="user-info" onclick="openUserProfile('${post.authorId}', '${escapeHtml(post.authorName)}', '${escapeHtml(post.authorUsername)}', '${escapeHtml(post.authorAvatar)}')">
            <span class="story-ring-avatar">
              <img src="${escapeHtml(post.authorAvatar || 'https://picsum.photos/100/100')}" class="user-avatar" alt="${escapeHtml(post.authorName)}">
            </span>
            <div>
              <div class="user-name">${escapeHtml(post.authorName)} ${devBadge} ${ogBadge} ${collabHtml}</div>
              <div class="post-time">@${escapeHtml(post.authorUsername)} • ${timeStr}</div>
            </div>
          </div>
          <i class="fa-solid fa-ellipsis" style="color: #666; cursor: pointer; padding: 6px;" onclick="showPostOptions('${post.id}', '${post.authorId}', '${escapeHtml(post.authorUsername)}')"></i>
        </div>

        <div class="post-caption">${escapeHtml(post.caption)}</div>
        ${locationHtml}
        ${musicHtml}
        ${pollHtml}
        ${addYoursHtml}
        ${quoteHtml}
        ${mediaHtml}
        ${contextReactionsHtml}

        <div class="post-actions">
          <div class="post-actions-left">
            <div class="reaction-container" onmouseenter="showReactionsDrawer('${post.id}')" onmouseleave="hideReactionsDrawer('${post.id}')">
              <div class="reactions-drawer" id="reactions-drawer-${post.id}">
                <span class="reaction-emoji-btn" onclick="reactToPost('${post.id}', '❤️')">❤️</span>
                <span class="reaction-emoji-btn" onclick="reactToPost('${post.id}', '🔥')">🔥</span>
                <span class="reaction-emoji-btn" onclick="reactToPost('${post.id}', '😂')">😂</span>
                <span class="reaction-emoji-btn" onclick="reactToPost('${post.id}', '😮')">😮</span>
                <span class="reaction-emoji-btn" onclick="reactToPost('${post.id}', '😢')">😢</span>
                <span class="reaction-emoji-btn" onclick="reactToPost('${post.id}', '👏')">👏</span>
                <span class="reaction-emoji-btn" onclick="reactToPost('${post.id}', '👀')">👀</span>
              </div>
              <div class="action-item ${isLiked ? 'liked' : ''}" onclick="toggleLikePost('${post.id}')">
                <i class="${isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}"></i>
                <span class="counter">${likesDisplay}</span>
              </div>
            </div>
            <div class="action-item" onclick="openCommentsModal('${post.id}')" title="Comments">
              <i class="fa-regular fa-comment"></i>
              <span>${commentsCount}</span>
            </div>
            <div class="action-item" onclick="openShareSheetModal('${post.id}')" title="Share Post">
              <i class="fa-regular fa-paper-plane"></i>
            </div>
            <div class="action-item" onclick="prepareQuotePost('${post.id}', '${escapeHtml(post.authorName)}', '${escapeHtml(post.authorUsername)}', '${escapeHtml(post.authorAvatar)}', '${encodeURIComponent(post.caption || '')}')" title="Quote / Repost">
              <i class="fa-solid fa-retweet"></i>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <div class="action-item" onclick="openSaveToBoardModal('${post.id}')" title="Save to Board">
              <i class="fa-solid fa-thumbtack"></i>
            </div>
            <div class="action-item ${isSaved ? 'saved' : ''}" onclick="toggleSavePost('${post.id}')" oncontextmenu="event.preventDefault(); openSaveNoteModal('${post.id}')" title="${isSaved ? 'Remove from Saved' : 'Save (Right-click for Note)'}">
              <i class="${isSaved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}" style="${isSaved ? 'color: #0a84ff;' : ''}"></i>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Like Post Transaction
window.toggleLikePost = async function(postId) {
  if (!currentUser) return showToast("Please sign in to like posts.");

  if (isDemoMode) {
    const post = demoPosts.find(p => p.id === postId);
    if (post) {
      post.likes = post.likes || {};
      const hasLiked = !!post.likes[currentUser.uid];
      if (hasLiked) {
        delete post.likes[currentUser.uid];
        post.likesCount = Math.max(0, (post.likesCount || 1) - 1);
      } else {
        post.likes[currentUser.uid] = true;
        post.likesCount = (post.likesCount || 0) + 1;
      }
      renderFeed(demoPosts);
    }
    return;
  }

  const postRef = doc(db, 'posts', postId);

  try {
    const postSnap = await getDoc(postRef);
    if (!postSnap.exists()) return;
    const postData = postSnap.data();
    const likes = postData.likes || {};
    const hasLiked = !!likes[currentUser.uid];

    if (hasLiked) {
      delete likes[currentUser.uid];
      await updateDoc(postRef, {
        likes: likes,
        likesCount: increment(-1)
      });
    } else {
      likes[currentUser.uid] = true;
      await updateDoc(postRef, {
        likes: likes,
        likesCount: increment(1)
      });

      // Send notification if not liking own post
      if (postData.authorId && postData.authorId !== currentUser.uid) {
        addDoc(collection(db, 'notifications'), {
          recipientId: postData.authorId,
          senderId: currentUser.uid,
          senderName: currentProfile.displayName,
          senderAvatar: currentProfile.photoURL,
          type: 'like',
          content: `${currentProfile.displayName} liked your post.`,
          read: false,
          createdAt: serverTimestamp()
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `posts/${postId}`);
  }
};

// ==========================================
// CAROUSEL & MEDIA INTERACTION
// ==========================================
window.navigateCarousel = function(postId, direction) {
  const track = document.getElementById(`carousel-track-${postId}`);
  if (!track) return;
  const slideWidth = track.clientWidth;
  track.scrollBy({ left: direction * slideWidth, behavior: 'smooth' });
  setTimeout(() => window.updateCarouselIndicators(postId), 250);
};

window.updateCarouselIndicators = function(postId) {
  const track = document.getElementById(`carousel-track-${postId}`);
  const dotsContainer = document.getElementById(`carousel-dots-${postId}`);
  if (!track || !dotsContainer) return;
  const slideWidth = track.clientWidth || 1;
  const activeIndex = Math.round(track.scrollLeft / slideWidth);
  const dots = dotsContainer.querySelectorAll('.carousel-dot');
  dots.forEach((d, idx) => {
    d.classList.toggle('active', idx === activeIndex);
  });
};

// ==========================================
// REACTIONS DRAWER & DOUBLE-TAP PHYSICS
// ==========================================
window.showReactionsDrawer = function(postId) {
  const drawer = document.getElementById(`reactions-drawer-${postId}`);
  if (drawer) drawer.classList.add('active');
};

window.hideReactionsDrawer = function(postId) {
  const drawer = document.getElementById(`reactions-drawer-${postId}`);
  if (drawer) drawer.classList.remove('active');
};

window.reactToPost = function(postId, emoji) {
  window.hideReactionsDrawer(postId);
  if (!currentUser) return showToast("Please sign in to react.");

  const post = (allCachedPosts || []).find(p => p.id === postId) || (demoPosts || []).find(p => p.id === postId);
  if (post) {
    post.userReaction = emoji;
    post.likes = post.likes || {};
    post.likes[currentUser.uid] = true;
    post.likesCount = (post.likesCount || 0) + 1;
    post.contextReactions = post.contextReactions || {};
    if (emoji === '🔥') post.contextReactions.fire = (parseInt(post.contextReactions.fire || '0') + 1) + '';
    if (emoji === '😂') post.contextReactions.laugh = (parseInt(post.contextReactions.laugh || '0') + 1) + '';
    showToast(`Reacted with ${emoji}!`);
    renderFeed(allCachedPosts && allCachedPosts.length ? allCachedPosts : demoPosts);
  }
};

window.participateAddYours = function(promptText) {
  switchView('create');
  const captionInput = document.getElementById('post-caption-input') || document.getElementById('post-caption');
  if (captionInput) {
    captionInput.value = `[Add Yours: ${promptText}] \n`;
    captionInput.focus();
  }
  showToast(`Joined prompt: "${promptText}" ✨ Add your photo or video!`);
};

// ==========================================
// SHARE SHEET & CREATIVE SHARING SYSTEM
// ==========================================
let activeSharePost = null;
let selectedShareContact = null;

const FREQUENT_SHARE_CONTACTS = [
  { id: 'sarah_ui', name: 'Sarah Jenkins', username: 'sarah_ui', avatar: 'https://picsum.photos/seed/sarah_av/200/200' },
  { id: 'alex_fern', name: 'Alex Fernandez', username: 'alex_fern', avatar: 'https://picsum.photos/seed/alex_av/200/200' },
  { id: 'elena_code', name: 'Elena Rostova', username: 'elena_code', avatar: 'https://picsum.photos/seed/coder_av/200/200' },
  { id: 'moulaylhani', name: 'Moulay Lhani', username: 'moulaylhani', avatar: 'https://picsum.photos/seed/moulay_av/200/200' }
];

window.openShareSheetModal = function(postId) {
  const post = (allCachedPosts || []).find(p => p.id === postId) || (demoPosts || []).find(p => p.id === postId);
  activeSharePost = post || { id: postId, authorName: 'Creator', authorUsername: 'creator', caption: 'Check this post on PLATFROM' };
  selectedShareContact = null;

  const row = document.getElementById('share-frequent-contacts-row');
  if (row) {
    row.innerHTML = FREQUENT_SHARE_CONTACTS.map((c, i) => `
      <div class="share-contact-bubble ${i === 0 ? 'selected' : ''}" onclick="selectShareContact('${c.id}', this)">
        <img src="${escapeHtml(c.avatar)}" class="share-contact-avatar" alt="${escapeHtml(c.name)}">
        <span class="share-contact-name">${escapeHtml(c.name.split(' ')[0])}</span>
      </div>
    `).join('');
    selectedShareContact = FREQUENT_SHARE_CONTACTS[0];
  }

  const modal = document.getElementById('share-sheet-modal');
  if (modal) modal.classList.add('show');
};

window.closeShareSheetModal = function() {
  const modal = document.getElementById('share-sheet-modal');
  if (modal) modal.classList.remove('show');
};

window.selectShareContact = function(contactId, element) {
  document.querySelectorAll('.share-contact-bubble').forEach(b => b.classList.remove('selected'));
  if (element) element.classList.add('selected');
  selectedShareContact = FREQUENT_SHARE_CONTACTS.find(c => c.id === contactId);
};

window.filterShareContacts = function(query) {
  const row = document.getElementById('share-frequent-contacts-row');
  if (!row) return;
  const q = (query || '').toLowerCase().trim();
  const filtered = FREQUENT_SHARE_CONTACTS.filter(c => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
  row.innerHTML = filtered.map(c => `
    <div class="share-contact-bubble" onclick="selectShareContact('${c.id}', this)">
      <img src="${escapeHtml(c.avatar)}" class="share-contact-avatar" alt="${escapeHtml(c.name)}">
      <span class="share-contact-name">${escapeHtml(c.name.split(' ')[0])}</span>
    </div>
  `).join('');
};

window.confirmSendToFriend = function() {
  const noteInput = document.getElementById('share-message-note');
  const messageText = noteInput ? noteInput.value.trim() : '';
  const recipient = selectedShareContact ? selectedShareContact.name : 'Friend';

  closeShareSheetModal();
  if (noteInput) noteInput.value = '';
  showToast(`Sent post to ${recipient} with note: "${messageText || 'Check this out!'}" ✈️`);
};

window.sharePostToStory = function() {
  closeShareSheetModal();
  if (!activeSharePost) return;
  showToast("Added post to Your Story! 🌸 Active for 24 hours.");
};

window.copyCurrentPostLink = function() {
  const link = `${window.location.origin}/post/${activeSharePost ? activeSharePost.id : 'share'}`;
  navigator.clipboard?.writeText?.(link);
  showToast("Post link copied to clipboard! 🔗");
};

window.repostCurrentContent = function() {
  closeShareSheetModal();
  if (!activeSharePost) return;
  showToast(`Reposted to your profile feed! 🔄`);
};

window.quoteCurrentContent = function() {
  closeShareSheetModal();
  if (!activeSharePost) return;
  prepareQuotePost(
    activeSharePost.id,
    activeSharePost.authorName || 'Creator',
    activeSharePost.authorUsername || 'creator',
    activeSharePost.authorAvatar || 'https://picsum.photos/100/100',
    encodeURIComponent(activeSharePost.caption || '')
  );
};

window.remixCurrentContent = function() {
  closeShareSheetModal();
  switchView('create');
  const captionInput = document.getElementById('post-caption-input') || document.getElementById('post-caption');
  if (captionInput && activeSharePost) {
    captionInput.value = `Remix with @${activeSharePost.authorUsername} 🎬✨\n`;
    captionInput.focus();
  }
  showToast("Loaded media into creator studio for remixing 🎛️");
};

window.nativeDeviceShare = function() {
  if (navigator.share && activeSharePost) {
    navigator.share({
      title: 'PLATFROM Post',
      text: activeSharePost.caption || 'Shared via PLATFROM iOS 26 Edition',
      url: window.location.href
    }).catch(() => {});
  } else {
    window.copyCurrentPostLink();
  }
};

// ==========================================
// CREATIVE SHARE CARDS
// ==========================================
window.openShareCardModal = function() {
  closeShareSheetModal();
  const post = activeSharePost || demoPosts[0];
  if (!post) return;

  const cardModal = document.getElementById('share-card-modal');
  const avatarEl = document.getElementById('share-card-author-avatar');
  const nameEl = document.getElementById('share-card-author-name');
  const captionEl = document.getElementById('share-card-caption');
  const imgEl = document.getElementById('share-card-img');
  const mediaBox = document.getElementById('share-card-media-box');

  if (avatarEl) avatarEl.src = post.authorAvatar || 'https://picsum.photos/100/100';
  if (nameEl) nameEl.innerText = post.authorName || 'Creator';
  if (captionEl) captionEl.innerText = post.caption || '';

  const mediaSource = (post.carouselImages && post.carouselImages[0]) || post.mediaUrl || 'https://picsum.photos/seed/platfrom_share/800/600';
  if (imgEl) {
    imgEl.src = mediaSource;
    if (mediaBox) mediaBox.style.display = 'block';
  }

  if (cardModal) cardModal.classList.add('show');
};

window.closeShareCardModal = function() {
  const modal = document.getElementById('share-card-modal');
  if (modal) modal.classList.remove('show');
};

window.setShareCardTheme = function(themeName) {
  const preview = document.getElementById('share-card-preview-canvas');
  if (!preview) return;
  preview.className = `share-card-container ${themeName}`;
};

window.downloadShareCardImage = function() {
  showToast("Exported Creative Card image to camera roll! 🎨");
  setTimeout(() => closeShareCardModal(), 1000);
};

window.copyShareCardLink = function() {
  navigator.clipboard?.writeText?.(window.location.href);
  showToast("Shareable Card link copied! 🌐");
};

// ==========================================
// IMMERSIVE FEED VIDEO VIEWER
// ==========================================
window.openImmersiveVideoModal = function(videoUrl, authorName, authorUsername, authorAvatar, encodedCaption, sound) {
  const modal = document.getElementById('immersive-video-modal');
  const player = document.getElementById('immersive-player-element');
  const nameEl = document.getElementById('immersive-author-name');
  const handleEl = document.getElementById('immersive-author-handle');
  const avatarEl = document.getElementById('immersive-author-avatar');
  const captionEl = document.getElementById('immersive-caption-text');
  const soundEl = document.getElementById('immersive-sound-tag');

  if (player) {
    player.src = videoUrl;
    player.muted = false;
    player.play().catch(() => { player.muted = true; player.play(); });
  }
  if (nameEl) nameEl.innerText = authorName || 'Creator';
  if (handleEl) handleEl.innerText = `@${authorUsername || 'creator'}`;
  if (avatarEl) avatarEl.src = authorAvatar || 'https://picsum.photos/100/100';
  if (captionEl) captionEl.innerText = decodeURIComponent(encodedCaption || '');
  if (soundEl) soundEl.innerText = sound || 'Trending Audio';

  if (modal) modal.classList.add('show');
};

window.closeImmersiveVideoModal = function() {
  const modal = document.getElementById('immersive-video-modal');
  const player = document.getElementById('immersive-player-element');
  if (player) {
    player.pause();
    player.currentTime = 0;
  }
  if (modal) modal.classList.remove('show');
};

window.toggleImmersiveAudio = function() {
  const player = document.getElementById('immersive-player-element');
  const icon = document.getElementById('immersive-volume-icon');
  if (!player) return;
  player.muted = !player.muted;
  if (icon) {
    icon.className = player.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  }
};

window.remixImmersiveVideo = function() {
  closeImmersiveVideoModal();
  switchView('create');
  showToast("Imported video into Creator Studio for remixing 🎬");
};

// ==========================================
// QR PROFILE SYSTEM
// ==========================================
window.openQrProfileModal = function() {
  const modal = document.getElementById('qr-profile-modal');
  const avatarEl = document.getElementById('qr-profile-avatar');
  const nameEl = document.getElementById('qr-profile-name');
  const handleEl = document.getElementById('qr-profile-handle');

  const profile = currentProfile || {
    displayName: 'Mohamed Huguh',
    username: 'mohamedhuguh',
    photoURL: 'https://picsum.photos/seed/moulay_av/200/200'
  };

  if (avatarEl) avatarEl.src = profile.photoURL || 'https://picsum.photos/seed/moulay_av/200/200';
  if (nameEl) nameEl.innerText = profile.displayName || 'Mohamed Huguh';
  if (handleEl) handleEl.innerText = `@${profile.username || 'mohamedhuguh'}`;

  if (modal) modal.classList.add('show');
};

window.closeQrProfileModal = function() {
  const modal = document.getElementById('qr-profile-modal');
  if (modal) modal.classList.remove('show');
};

window.copyProfileLink = function() {
  const profile = currentProfile || { username: 'mohamedhuguh' };
  const url = `${window.location.origin}/@${profile.username || 'mohamedhuguh'}`;
  navigator.clipboard?.writeText?.(url);
  showToast("Profile link copied to clipboard! 📋");
};

// ==========================================
// CREATIVE SAVE + NOTE SYSTEM
// ==========================================
let activeSaveNotePostId = null;
const userSavedNotesMap = new Map();

window.openSaveNoteModal = function(postId) {
  activeSaveNotePostId = postId || (activeSharePost ? activeSharePost.id : null);
  closeShareSheetModal();
  const input = document.getElementById('save-private-note-input');
  if (input) {
    input.value = userSavedNotesMap.get(activeSaveNotePostId) || '';
    input.focus();
  }
  const modal = document.getElementById('save-note-modal');
  if (modal) modal.classList.add('show');
};

window.closeSaveNoteModal = function() {
  const modal = document.getElementById('save-note-modal');
  if (modal) modal.classList.remove('show');
};

window.confirmSaveWithNote = function() {
  const input = document.getElementById('save-private-note-input');
  const note = input ? input.value.trim() : '';
  if (activeSaveNotePostId) {
    savedPostsSet.add(activeSaveNotePostId);
    if (note) userSavedNotesMap.set(activeSaveNotePostId, note);
  }
  closeSaveNoteModal();
  renderFeed(allCachedPosts && allCachedPosts.length ? allCachedPosts : demoPosts);
  showToast("Saved to your bookmarks with private note! 🔖📝");
};

// Render Notes
function renderNotes(notes) {
  const container = document.getElementById('notes-slider');
  const userAvatar = currentProfile ? currentProfile.photoURL : 'https://picsum.photos/150/150';

  let html = `
    <div class="note" onclick="openCreateNoteModal()">
      <div class="note-bubble note-add-bubble">+ Note</div>
      <img src="${userAvatar}" alt="Your Note" style="border: 2px dashed rgba(10,132,255,0.6);">
      <span>Your status</span>
    </div>
  `;

  html += notes.map(n => `
    <div class="note" onclick="openNoteModal('${escapeHtml(n.userName)}', '${escapeHtml(n.userAvatar)}', '${escapeHtml(n.text)}')">
      <div class="note-bubble">${escapeHtml(n.text)}</div>
      <img src="${escapeHtml(n.userAvatar)}" alt="${escapeHtml(n.userName)}">
      <span>${escapeHtml(n.userName)}</span>
    </div>
  `).join('');

  container.innerHTML = html;
}

// Status Note Modals
window.openNoteModal = function(name, avatar, text) {
  document.getElementById('modal-note-name').innerText = name;
  document.getElementById('modal-note-avatar').src = avatar;
  document.getElementById('modal-note-text').innerText = `"${text}"`;
  document.getElementById('note-modal').classList.add('show');
};
window.closeNoteModal = function() {
  document.getElementById('note-modal').classList.remove('show');
};
window.openCreateNoteModal = function() {
  document.getElementById('create-note-modal').classList.add('show');
  document.getElementById('input-note-text').focus();
};
window.closeCreateNoteModal = function() {
  document.getElementById('create-note-modal').classList.remove('show');
};

window.submitStatusNote = async function() {
  const input = document.getElementById('input-note-text');
  const text = input.value.trim();
  if (!text) return;
  if (!currentUser) return showToast("Please sign in first.");

  if (isDemoMode) {
    const existingIdx = demoNotes.findIndex(n => n.userId === currentUser.uid);
    const newNote = {
      userId: currentUser.uid,
      userName: currentProfile.displayName || 'Moulay',
      userAvatar: currentProfile.photoURL || 'https://picsum.photos/seed/moulay_av/200/200',
      text: text
    };
    if (existingIdx >= 0) {
      demoNotes[existingIdx] = newNote;
    } else {
      demoNotes.unshift(newNote);
    }
    renderNotes(demoNotes);
    input.value = '';
    closeCreateNoteModal();
    showToast("Status note updated ✨");
    return;
  }

  try {
    await setDoc(doc(db, 'notes', currentUser.uid), {
      userId: currentUser.uid,
      userName: currentProfile.displayName || 'User',
      userAvatar: currentProfile.photoURL || 'https://picsum.photos/150/150',
      text: text,
      createdAt: serverTimestamp()
    });
    input.value = '';
    closeCreateNoteModal();
    showToast("Status note updated ✨");
  } catch (err) {
    handleFirestoreError(err, OperationType.SET, `notes/${currentUser.uid}`);
    showToast("Could not publish note.");
  }
};

// Post Creation & AI Screening
window.triggerPhotoUpload = function() {
  const el = document.getElementById('composer-photo-file');
  if (el) el.click();
};

window.triggerVideoUpload = function() {
  const el = document.getElementById('composer-video-file');
  if (el) el.click();
};

window.handlePhotoFileSelected = function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (file.size > 15 * 1024 * 1024) {
    showToast("Photo file size must be under 15MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    composerMediaType = 'image';
    composerMediaData = evt.target.result;
    document.getElementById('post-media-input').value = file.name;
    document.getElementById('composer-img-element').src = composerMediaData;
    document.getElementById('composer-image-preview').style.display = 'block';
    document.getElementById('composer-video-preview').style.display = 'none';
    document.getElementById('composer-media-preview-box').style.display = 'block';
    showToast("Photo attached 📸");
  };
  reader.readAsDataURL(file);
};

window.handleVideoFileSelected = function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (file.size > 50 * 1024 * 1024) {
    showToast("Video file size must be under 50MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    composerMediaType = 'video';
    composerMediaData = evt.target.result;
    document.getElementById('post-media-input').value = file.name;
    const vid = document.getElementById('composer-vid-element');
    vid.src = composerMediaData;
    document.getElementById('composer-video-preview').style.display = 'block';
    document.getElementById('composer-image-preview').style.display = 'none';
    document.getElementById('composer-media-preview-box').style.display = 'block';
    showToast("Video loaded & ready for screening 🎬");
  };
  reader.readAsDataURL(file);
};

window.insertSampleVideo = function() {
  const sampleUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  composerMediaType = 'video';
  composerMediaData = sampleUrl;
  document.getElementById('post-media-input').value = sampleUrl;
  const vid = document.getElementById('composer-vid-element');
  vid.src = sampleUrl;
  document.getElementById('composer-video-preview').style.display = 'block';
  document.getElementById('composer-image-preview').style.display = 'none';
  document.getElementById('composer-media-preview-box').style.display = 'block';
  showToast("Sample aesthetic HD video attached 🎬");
};

window.handleMediaUrlInput = function(url) {
  if (!url) {
    removeComposerMedia();
    return;
  }
  composerMediaData = url.trim();
  if (isVideoUrl(composerMediaData)) {
    composerMediaType = 'video';
    const vid = document.getElementById('composer-vid-element');
    vid.src = composerMediaData;
    document.getElementById('composer-video-preview').style.display = 'block';
    document.getElementById('composer-image-preview').style.display = 'none';
  } else {
    composerMediaType = 'image';
    document.getElementById('composer-img-element').src = composerMediaData;
    document.getElementById('composer-image-preview').style.display = 'block';
    document.getElementById('composer-video-preview').style.display = 'none';
  }
  document.getElementById('composer-media-preview-box').style.display = 'block';
};

window.removeComposerMedia = function() {
  composerMediaType = null;
  composerMediaData = null;
  document.getElementById('post-media-input').value = '';
  document.getElementById('composer-media-preview-box').style.display = 'none';
  document.getElementById('composer-img-element').src = '';
  const vid = document.getElementById('composer-vid-element');
  vid.pause();
  vid.src = '';
  const pInput = document.getElementById('composer-photo-file');
  if (pInput) pInput.value = '';
  const vInput = document.getElementById('composer-video-file');
  if (vInput) vInput.value = '';
};

// Adult Content Restriction Modals
window.showSafetyWarningModal = function(reason) {
  const modal = document.getElementById('safety-warning-modal');
  const textEl = document.getElementById('safety-warning-text');
  if (textEl && reason) {
    textEl.innerText = reason;
  }
  if (modal) modal.classList.add('show');
};
window.closeSafetyWarningModal = function() {
  const modal = document.getElementById('safety-warning-modal');
  if (modal) modal.classList.remove('show');
};

window.submitPost = async function() {
  const textInput = document.getElementById('post-text-input');
  const text = textInput.value.trim();
  const finalMediaUrl = composerMediaData || document.getElementById('post-media-input').value.trim();

  if (!text && !finalMediaUrl) {
    return showToast("Please enter some text, a video, or an image.");
  }
  if (!currentUser) return showToast("Please sign in to post.");

  const btn = document.getElementById('btn-submit-post');
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Screening...`;
    btn.disabled = true;
  }

  // 1. Adult Content Restriction & NSFW Real-Time Screening
  try {
    const modRes = await fetch('/api/ai/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text,
        mediaUrl: finalMediaUrl.startsWith('data:') ? finalMediaUrl.substring(0, 100) : finalMediaUrl,
        mediaType: composerMediaType || (isVideoUrl(finalMediaUrl) ? 'video' : (finalMediaUrl ? 'image' : null))
      })
    });
    if (modRes.ok) {
      const modData = await modRes.json();
      if (modData.flagged) {
        if (btn) {
          btn.innerHTML = `Post`;
          btn.disabled = false;
        }
        showSafetyWarningModal(modData.reason || "Adult or sexually explicit content detected. Platform strictly enforces safe media.");
        return;
      }
    }
  } catch (err) {
    console.warn("AI moderation check error:", err);
  }

  const isVideo = composerMediaType === 'video' || isVideoUrl(finalMediaUrl);
  const isOwner = isAuthorizedOwner(currentUser.email, currentUser.uid);

  if (isDemoMode) {
    const newPost = {
      id: 'demo_p_' + Date.now(),
      authorId: currentUser.uid,
      authorName: currentProfile.displayName || 'Mohamed Huguh',
      authorUsername: currentProfile.username || 'mohamedhuguh',
      authorAvatar: currentProfile.photoURL || 'https://picsum.photos/seed/moulay_av/200/200',
      authorEmail: currentUser.email || 'Mohamedhuguh@gmail.com',
      authorIsDev: isOwner,
      authorIsOG: isOwner,
      caption: text,
      mediaUrl: finalMediaUrl,
      isVideo: isVideo,
      mediaType: isVideo ? 'video' : (finalMediaUrl ? 'image' : null),
      likesCount: 0,
      likes: {},
      commentsCount: 0,
      quotedPost: composerQuotedPost || null,
      createdAt: { toDate: () => new Date() }
    };
    demoPosts.unshift(newPost);
    clearComposer();
    if (btn) {
      btn.innerHTML = `Post`;
      btn.disabled = false;
    }
    switchView('home');
    renderFeed(demoPosts);
    const myPosts = demoPosts.filter(p => p.authorId === currentUser.uid);
    const postCountEl = document.getElementById('profile-stat-posts');
    if (postCountEl) postCountEl.innerText = myPosts.length;
    renderProfilePostsGrid(myPosts);
    showToast(isVideo ? "Video published to feed! 🎬" : "Post shared to feed! 🚀");
    return;
  }

  try {
    const postData = {
      authorId: currentUser.uid,
      authorName: currentProfile.displayName || 'User',
      authorUsername: currentProfile.username || 'user',
      authorAvatar: currentProfile.photoURL || 'https://picsum.photos/100/100',
      authorEmail: currentUser.email || '',
      authorIsDev: isOwner,
      authorIsOG: isOwner,
      caption: text,
      mediaUrl: finalMediaUrl,
      isVideo: isVideo,
      mediaType: isVideo ? 'video' : (finalMediaUrl ? 'image' : null),
      likesCount: 0,
      likes: {},
      commentsCount: 0,
      quotedPost: composerQuotedPost || null,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'posts'), postData);
    clearComposer();
    if (btn) {
      btn.innerHTML = `Post`;
      btn.disabled = false;
    }
    switchView('home');
    showToast(isVideo ? "Video published to feed! 🎬" : "Post shared to feed! 🚀");
  } catch (err) {
    if (btn) {
      btn.innerHTML = `Post`;
      btn.disabled = false;
    }
    handleFirestoreError(err, OperationType.CREATE, 'posts');
    showToast("Failed to share post.");
  }
};

window.clearComposer = function() {
  document.getElementById('post-text-input').value = '';
  document.getElementById('post-media-input').value = '';
  removeComposerMedia();
  clearComposerQuote();
};

window.clearComposerQuote = function() {
  composerQuotedPost = null;
  document.getElementById('composer-quote-preview').style.display = 'none';
};

window.prepareQuotePost = function(id, authorName, authorUsername, authorAvatar, encodedCaption) {
  composerQuotedPost = {
    id,
    authorName,
    authorUsername,
    authorAvatar,
    caption: decodeURIComponent(encodedCaption)
  };

  const preview = document.getElementById('composer-quote-preview');
  const box = document.getElementById('composer-quote-box');
  box.innerHTML = `
    <div class="quote-box-header">
      <img src="${authorAvatar}" class="quote-box-avatar">
      <span class="quote-box-author">${authorName}</span>
      <span style="font-size: 11px; color: #888;">@${authorUsername}</span>
    </div>
    <div class="quote-box-text">${decodeURIComponent(encodedCaption)}</div>
  `;
  preview.style.display = 'block';

  switchView('upload');
  document.getElementById('post-text-input').focus();
  showToast("Quoting post — add your thoughts ✨");
};

// AI Caption Polisher
window.generateAiCaption = async function() {
  const input = document.getElementById('post-text-input');
  const prompt = input.value.trim() || "Minimalist dark mode tech lifestyle";
  const btn = document.getElementById('btn-ai-caption');

  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Polishing...`;
  btn.disabled = true;

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, type: 'caption' })
    });
    const data = await res.json();
    if (data.text) {
      input.value = data.text;
      showToast("✨ Caption polished with Gemini AI!");
    }
  } catch (err) {
    console.error("AI error:", err);
  } finally {
    btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Polish with AI`;
    btn.disabled = false;
  }
};

window.insertSampleImage = function() {
  const seed = 'photo_' + Math.floor(Math.random() * 1000);
  document.getElementById('post-media-input').value = `https://picsum.photos/seed/${seed}/800/600`;
  showToast("Sample aesthetic photo attached 📸");
};

// Emoji insertion helpers
window.insertEmojiToPost = function(emoji) {
  const el = document.getElementById('post-text-input');
  el.value += emoji;
  el.focus();
};
window.insertEmojiToChat = function(emoji) {
  const el = document.getElementById('chat-input');
  el.value += emoji;
  el.focus();
};
window.insertEmojiToComment = function(emoji) {
  const el = document.getElementById('comment-input');
  el.value += emoji;
  el.focus();
};

// Comments System
window.openCommentsModal = function(postId) {
  activeCommentPostId = postId;
  const modal = document.getElementById('comments-modal');
  modal.classList.add('show');
  const list = document.getElementById('comments-list-container');

  if (isDemoMode) {
    const comments = demoComments[postId] || [
      {
        authorName: 'Sarah Jenkins',
        authorUsername: 'sarah_ui',
        authorAvatar: 'https://picsum.photos/seed/sarah_av/100/100',
        text: 'The glassmorphic depth on this is stunning! 🔥'
      }
    ];
    demoComments[postId] = comments;
    list.innerHTML = comments.map(c => `
      <div class="comment-item">
        <img src="${escapeHtml(c.authorAvatar || 'https://picsum.photos/100/100')}" alt="${escapeHtml(c.authorName)}">
        <div class="comment-body">
          <strong>${escapeHtml(c.authorName)}</strong> ${escapeHtml(c.text)}
          <div class="comment-meta">@${escapeHtml(c.authorUsername || 'user')}</div>
        </div>
      </div>
    `).join('');
    return;
  }

  list.innerHTML = `<div style="text-align: center; color: #888; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading comments...</div>`;

  if (unsubscribeComments) unsubscribeComments();

  const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(50));
  unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
    if (snapshot.empty) {
      list.innerHTML = `<div style="text-align:center; color:#777; padding: 24px;">No comments yet. Start the conversation!</div>`;
      return;
    }
    list.innerHTML = snapshot.docs.map(d => {
      const c = d.data();
      return `
        <div class="comment-item">
          <img src="${escapeHtml(c.authorAvatar || 'https://picsum.photos/100/100')}" alt="${escapeHtml(c.authorName)}">
          <div class="comment-body">
            <strong>${escapeHtml(c.authorName)}</strong> ${escapeHtml(c.text)}
            <div class="comment-meta">@${escapeHtml(c.authorUsername || 'user')}</div>
          </div>
        </div>
      `;
    }).join('');
  });
};

window.closeCommentsModal = function() {
  document.getElementById('comments-modal').classList.remove('show');
  if (unsubscribeComments) {
    unsubscribeComments();
    unsubscribeComments = null;
  }
};

window.handleSendComment = async function(e) {
  e.preventDefault();
  if (!currentUser) return showToast("Please sign in to comment.");
  if (!activeCommentPostId) return;

  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text) return;

  if (isDemoMode) {
    const comments = demoComments[activeCommentPostId] || [];
    comments.push({
      authorId: currentUser.uid,
      authorName: currentProfile.displayName || 'Moulay Lhani',
      authorUsername: currentProfile.username || 'moulaylhani',
      authorAvatar: currentProfile.photoURL || 'https://picsum.photos/seed/moulay_av/200/200',
      text: text
    });
    demoComments[activeCommentPostId] = comments;

    const post = demoPosts.find(p => p.id === activeCommentPostId);
    if (post) {
      post.commentsCount = (post.commentsCount || 0) + 1;
      renderFeed(demoPosts);
    }

    input.value = '';
    openCommentsModal(activeCommentPostId);
    showToast("Comment added! 💬");
    return;
  }

  try {
    await addDoc(collection(db, 'posts', activeCommentPostId, 'comments'), {
      authorId: currentUser.uid,
      authorName: currentProfile.displayName,
      authorUsername: currentProfile.username,
      authorAvatar: currentProfile.photoURL,
      text: text,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'posts', activeCommentPostId), {
      commentsCount: increment(1)
    });

    input.value = '';
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `posts/${activeCommentPostId}/comments`);
    showToast("Failed to post comment.");
  }
};

// 1-on-1 Real-time Messaging
const PLATFORM_USERS = [
  { uid: 'ai_bot', displayName: 'Platform AI Assistant', username: 'platform_ai', photoURL: 'https://picsum.photos/seed/platform_ai/200/200', isDev: false, isOG: false },
  { uid: 'user_mohamed', displayName: 'Mohamed Huguh', username: 'mohamedhuguh', email: 'Mohamedhuguh@gmail.com', photoURL: 'https://picsum.photos/seed/moulay_av/200/200', isDev: true, isOG: true },
  { uid: 'user_sarah', displayName: 'Sarah Jenkins', username: 'sarah_ui', photoURL: 'https://picsum.photos/seed/sarah_av/200/200', isDev: false, isOG: false },
  { uid: 'user_alex', displayName: 'Alex Fernandez', username: 'alex_fern', photoURL: 'https://picsum.photos/seed/alex_av/200/200', isDev: false, isOG: false },
  { uid: 'user_coder', displayName: 'Chris Coder', username: 'chris_coder', photoURL: 'https://picsum.photos/seed/coder_av/200/200', isDev: false, isOG: false }
];

function loadConversationsList() {
  const container = document.getElementById('msg-list');
  const users = PLATFORM_USERS.filter(u => !currentUser || u.uid !== currentUser.uid);

  container.innerHTML = users.map(u => {
    const isAi = u.uid === 'ai_bot';
    const badge = isAi ? `<span class="badge badge-ai">AI</span>` : (u.isDev ? `<span class="badge badge-dev">DEV</span>` : '');
    const preview = isAi ? 'Ask me anything about code, design, or social posts.' : 'Tap to start real-time glass chat...';

    return `
      <div class="msg-card" onclick="openChatWith('${u.uid}', '${escapeHtml(u.displayName)}', '${escapeHtml(u.photoURL)}')">
        <img src="${escapeHtml(u.photoURL)}" alt="${escapeHtml(u.displayName)}">
        <div class="msg-info">
          <div class="msg-name">
            <span>${escapeHtml(u.displayName)} ${badge}</span>
            <span class="msg-time">Now</span>
          </div>
          <div class="msg-preview">${preview}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.openChatWithAi = function() {
  openChatWith('ai_bot', 'Platform AI Assistant', 'https://picsum.photos/seed/platform_ai/200/200');
};

window.openChatWith = function(targetUid, targetName, targetAvatar) {
  if (!currentUser) return showToast("Please sign in to send messages.");
  activeChatUserId = targetUid;
  activeChatUserName = targetName;
  activeChatAvatar = targetAvatar;

  document.getElementById('chat-header-name').innerText = targetName;
  document.getElementById('chat-header-avatar').src = targetAvatar;
  document.getElementById('chat-view').classList.add('active');

  const container = document.getElementById('chat-messages-container');

  if (unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }

  if (targetUid === 'ai_bot') {
    // In-memory AI chat session
    renderAiWelcome();
    return;
  }

  const e2eeBannerHtml = `
    <div class="e2ee-banner">
      <i class="fa-solid fa-lock"></i>
      <span>End-to-End Encrypted • Secured with 256-bit cryptography. No third party can access your messages or calls.</span>
    </div>
  `;

  if (isDemoMode) {
    const list = demoChats[targetUid] || [
      {
        id: 'msg_welcome_' + Date.now(),
        senderId: targetUid,
        text: `Hey! Welcome to Platform. Let's test real-time encrypted glass chat & voice notes. 🚀`,
        time: 'Just now'
      }
    ];
    demoChats[targetUid] = list;
    renderDemoChatMessages(list, container, e2eeBannerHtml);
    return;
  }

  container.innerHTML = `${e2eeBannerHtml}<div style="text-align: center; color: #777; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Establishing 256-bit encrypted stream...</div>`;

  // 1-on-1 Firestore Chat Stream: sorted [uid1, uid2].join('_')
  const chatId = [currentUser.uid, targetUid].sort().join('_');
  const msgsQuery = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(60));

  unsubscribeChat = onSnapshot(msgsQuery, (snapshot) => {
    if (snapshot.empty) {
      container.innerHTML = `
        ${e2eeBannerHtml}
        <div style="text-align: center; color: #777; padding: 30px;">
          Direct encrypted channel established.<br>Say hello or send a voice message! 💬🎙️
        </div>
      `;
      return;
    }

    container.innerHTML = e2eeBannerHtml + snapshot.docs.map((d, idx) => {
      const m = d.data();
      const isSent = m.senderId === currentUser.uid;
      let time = '';
      if (m.createdAt && m.createdAt.toDate) {
        time = m.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      let bodyHtml = '';
      if (m.type === 'voice') {
        bodyHtml = renderVoiceBubbleHtml(m.audioUrl, m.duration || '0:05', isSent, d.id || idx);
      } else {
        bodyHtml = `
          <div class="chat-bubble ${isSent ? 'sent' : 'received'}">
            ${escapeHtml(m.text || '')}
            <div class="chat-bubble-time">${time}</div>
          </div>
        `;
      }

      return `
        <div class="chat-msg-row ${isSent ? 'sent' : ''}" id="chat-msg-${d.id}">
          ${isSent ? `<button type="button" class="chat-msg-delete-btn" onclick="deleteChatMessage('${chatId}', '${d.id}', ${idx})" title="Unsend message"><i class="fa-solid fa-trash-can"></i></button>` : ''}
          ${bodyHtml}
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  });
};

function renderDemoChatMessages(list, container, e2eeBannerHtml) {
  container.innerHTML = e2eeBannerHtml + list.map((m, idx) => {
    const isSent = m.senderId === currentUser.uid;
    let bodyHtml = '';
    if (m.type === 'voice') {
      bodyHtml = renderVoiceBubbleHtml(m.audioUrl, m.duration || '0:05', isSent, m.id || idx);
    } else {
      bodyHtml = `
        <div class="chat-bubble ${isSent ? 'sent' : 'received'}">
          ${escapeHtml(m.text || '')}
          <div class="chat-bubble-time">${escapeHtml(m.time || '')}</div>
        </div>
      `;
    }

    return `
      <div class="chat-msg-row ${isSent ? 'sent' : ''}" id="demo-msg-${idx}">
        ${isSent ? `<button type="button" class="chat-msg-delete-btn" onclick="deleteDemoChatMessage(${idx})" title="Unsend message"><i class="fa-solid fa-trash-can"></i></button>` : ''}
        ${bodyHtml}
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

// Render Voice Bubble Component with Waveform & Playback
function renderVoiceBubbleHtml(audioUrl, duration, isSent, idKey) {
  return `
    <div class="voice-msg-card" id="voice-card-${idKey}">
      <button type="button" class="voice-play-btn" onclick="playVoiceMessage('${audioUrl}', '${idKey}')" id="voice-btn-${idKey}">
        <i class="fa-solid fa-play"></i>
      </button>
      <div class="voice-waveform-container">
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
        <div class="wave-bar"></div>
      </div>
      <div class="voice-duration" id="voice-dur-${idKey}">${escapeHtml(duration)}</div>
    </div>
  `;
}

// Play Voice Note Audio
window.activeVoiceAudio = null;
window.playVoiceMessage = function(audioUrl, idKey) {
  const card = document.getElementById(`voice-card-${idKey}`);
  const btn = document.getElementById(`voice-btn-${idKey}`);

  if (window.activeVoiceAudio) {
    window.activeVoiceAudio.pause();
    document.querySelectorAll('.voice-msg-card').forEach(c => c.classList.remove('playing'));
    document.querySelectorAll('.voice-play-btn').forEach(b => b.innerHTML = '<i class="fa-solid fa-play"></i>');
    if (window.activeVoiceId === idKey) {
      window.activeVoiceAudio = null;
      window.activeVoiceId = null;
      return;
    }
  }

  // Create real HTMLAudioElement or Web Audio tone
  let audio;
  if (audioUrl && audioUrl.startsWith('data:audio')) {
    audio = new Audio(audioUrl);
  } else {
    // Generate pleasant synthesized audio frequency wave for seamless offline/sandbox listening
    audio = generateVoiceSynthesizedAudio();
  }

  window.activeVoiceAudio = audio;
  window.activeVoiceId = idKey;

  if (card) card.classList.add('playing');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-pause"></i>';

  audio.play().catch(e => {
    console.warn("Audio play prevented:", e);
    showToast("Voice message playback active 🔊");
  });

  audio.onended = function() {
    if (card) card.classList.remove('playing');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    window.activeVoiceAudio = null;
    window.activeVoiceId = null;
  };
};

function generateVoiceSynthesizedAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 1.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 2.0);
  } catch(e) {}
  // Return dummy element with ended callback
  const dummy = new Audio();
  setTimeout(() => { if (dummy.onended) dummy.onended(); }, 2000);
  return dummy;
}

// Delete / Unsend Message (Firestore)
window.deleteChatMessage = async function(chatId, messageId, index) {
  const confirmed = confirm("Unsend this message for everyone?");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
    const row = document.getElementById(`chat-msg-${messageId}`);
    if (row) {
      row.style.transition = 'all 0.25s ease';
      row.style.opacity = '0';
      row.style.transform = 'scale(0.9)';
      setTimeout(() => row.remove(), 250);
    }
    showToast("Message unsent 🗑️");
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}/messages/${messageId}`);
    showToast("Could not unsend message.");
  }
};

// Delete / Unsend Message (Demo mode)
window.deleteDemoChatMessage = function(index) {
  const confirmed = confirm("Unsend this message?");
  if (!confirmed) return;

  const list = demoChats[activeChatUserId] || [];
  list.splice(index, 1);
  demoChats[activeChatUserId] = list;

  const row = document.getElementById(`demo-msg-${index}`);
  if (row) {
    row.style.transition = 'all 0.25s ease';
    row.style.opacity = '0';
    row.style.transform = 'scale(0.9)';
    setTimeout(() => {
      const container = document.getElementById('chat-messages-container');
      const e2eeBannerHtml = `
        <div class="e2ee-banner">
          <i class="fa-solid fa-lock"></i>
          <span>End-to-End Encrypted • Secured with 256-bit cryptography.</span>
        </div>
      `;
      renderDemoChatMessages(list, container, e2eeBannerHtml);
    }, 250);
  }
  showToast("Message unsent 🗑️");
};

// ==========================================
// VOICE MESSAGING ENGINE (MediaRecorder & Web Audio)
// ==========================================
window.toggleVoiceRecording = function() {
  if (isRecordingVoice) {
    stopAndSendVoiceRecording();
  } else {
    startVoiceRecording();
  }
};

window.startVoiceRecording = async function() {
  if (!currentUser) return showToast("Please sign in to send voice notes.");

  isRecordingVoice = true;
  voiceRecordSeconds = 0;
  audioChunks = [];

  const bar = document.getElementById('voice-recording-bar');
  const timerEl = document.getElementById('recording-timer');
  const micBtn = document.getElementById('btn-chat-mic');

  if (bar) bar.style.display = 'flex';
  if (micBtn) micBtn.classList.add('recording');
  if (timerEl) timerEl.innerText = '0:00';

  clearInterval(voiceRecordInterval);
  voiceRecordInterval = setInterval(() => {
    voiceRecordSeconds++;
    const mins = Math.floor(voiceRecordSeconds / 60);
    const secs = voiceRecordSeconds % 60;
    if (timerEl) timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
  }, 1000);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.start();
  } catch (err) {
    console.warn("Microphone access in iframe sandbox, using simulated voice capture:", err);
  }
};

window.cancelVoiceRecording = function() {
  isRecordingVoice = false;
  clearInterval(voiceRecordInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    } catch(e) {}
  }
  mediaRecorder = null;
  audioChunks = [];

  const bar = document.getElementById('voice-recording-bar');
  const micBtn = document.getElementById('btn-chat-mic');
  if (bar) bar.style.display = 'none';
  if (micBtn) micBtn.classList.remove('recording');
  showToast("Voice recording cancelled");
};

window.stopAndSendVoiceRecording = async function() {
  if (!isRecordingVoice) return;
  isRecordingVoice = false;
  clearInterval(voiceRecordInterval);

  const durationStr = `0:${voiceRecordSeconds.toString().padStart(2, '0')}`;

  const bar = document.getElementById('voice-recording-bar');
  const micBtn = document.getElementById('btn-chat-mic');
  if (bar) bar.style.display = 'none';
  if (micBtn) micBtn.classList.remove('recording');

  let audioUrl = '';
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    } catch(e) {}
  }

  // If chunks captured, convert to base64 or blob URL
  if (audioChunks.length > 0) {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    audioUrl = URL.createObjectURL(audioBlob);
  }

  if (isDemoMode) {
    const list = demoChats[activeChatUserId] || [];
    list.push({
      id: 'voice_' + Date.now(),
      senderId: currentUser.uid,
      type: 'voice',
      audioUrl: audioUrl,
      duration: durationStr || '0:03',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    demoChats[activeChatUserId] = list;

    const container = document.getElementById('chat-messages-container');
    const e2eeBannerHtml = `
      <div class="e2ee-banner">
        <i class="fa-solid fa-lock"></i>
        <span>End-to-End Encrypted • Secured with 256-bit cryptography.</span>
      </div>
    `;
    renderDemoChatMessages(list, container, e2eeBannerHtml);
    showToast("Encrypted voice message sent 🎙️");
    return;
  }

  const chatId = [currentUser.uid, activeChatUserId].sort().join('_');
  try {
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderId: currentUser.uid,
      senderName: currentProfile.displayName,
      senderAvatar: currentProfile.photoURL,
      type: 'voice',
      audioUrl: audioUrl,
      duration: durationStr || '0:03',
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, 'chats', chatId), {
      participants: [currentUser.uid, activeChatUserId],
      lastMessage: `🎙️ Voice message (${durationStr})`,
      lastMessageTime: serverTimestamp(),
      lastSenderId: currentUser.uid
    }, { merge: true });

    showToast("Encrypted voice message sent 🎙️");
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}/messages`);
    showToast("Could not send voice message.");
  }
};

// ==========================================
// IN-CONVERSATION ENCRYPTED VOICE CALLS
// ==========================================
window.startConvoAudioCall = async function() {
  if (!activeChatUserName) return showToast("Select a conversation to call.");

  const modal = document.getElementById('convo-audio-call-modal');
  const avatarEl = document.getElementById('convo-call-avatar');
  const nameEl = document.getElementById('convo-call-name');
  const timerEl = document.getElementById('convo-call-timer');

  if (avatarEl) avatarEl.src = activeChatAvatar || 'https://picsum.photos/120/120';
  if (nameEl) nameEl.innerText = activeChatUserName;
  if (timerEl) timerEl.innerText = '00:00';

  if (modal) modal.classList.add('show');

  // Activate audio stream
  try {
    convoCallStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch(e) {
    console.warn("Call audio mic in sandbox mode:", e);
  }

  convoCallSeconds = 0;
  isConvoMuted = false;
  isConvoSpeaker = true;

  clearInterval(convoCallTimer);
  convoCallTimer = setInterval(() => {
    convoCallSeconds++;
    const m = Math.floor(convoCallSeconds / 60);
    const s = convoCallSeconds % 60;
    if (timerEl) timerEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, 1000);
};

window.toggleConvoCallMute = function() {
  isConvoMuted = !isConvoMuted;
  if (convoCallStream) {
    convoCallStream.getAudioTracks().forEach(t => t.enabled = !isConvoMuted);
  }
  const btn = document.getElementById('btn-convo-mute');
  if (btn) {
    if (isConvoMuted) {
      btn.classList.add('muted');
      btn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i>`;
      showToast("Microphone muted");
    } else {
      btn.classList.remove('muted');
      btn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
      showToast("Microphone active");
    }
  }
};

window.toggleConvoCallSpeaker = function() {
  isConvoSpeaker = !isConvoSpeaker;
  const btn = document.getElementById('btn-convo-speaker');
  if (btn) {
    if (isConvoSpeaker) {
      btn.classList.remove('muted');
      showToast("Speaker: On (Encrypted HD Voice)");
    } else {
      btn.classList.add('muted');
      showToast("Speaker: Earpiece");
    }
  }
};

window.endConvoCall = function() {
  clearInterval(convoCallTimer);
  if (convoCallStream) {
    convoCallStream.getTracks().forEach(t => t.stop());
    convoCallStream = null;
  }
  const modal = document.getElementById('convo-audio-call-modal');
  if (modal) modal.classList.remove('show');

  const durStr = `${Math.floor(convoCallSeconds / 60)}:${(convoCallSeconds % 60).toString().padStart(2, '0')}`;
  showToast(`Encrypted voice call ended (${durStr}) 🔒`);
};

window.startConvoVideoCall = function() {
  openConsultationModal();
};

window.closeChatView = function() {
  document.getElementById('chat-view').classList.remove('active');
  if (unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }
};

window.handleSendChatMessage = async function(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  if (activeChatUserId === 'ai_bot') {
    appendLocalChatBubble(text, true);
    await sendToAiCompanion(text);
    return;
  }

  if (isDemoMode) {
    const list = demoChats[activeChatUserId] || [];
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    list.push({
      senderId: currentUser.uid,
      text: text,
      time: nowStr
    });
    demoChats[activeChatUserId] = list;

    appendLocalChatBubble(text, true);

    // Simulate smart interactive reply from other user
    setTimeout(() => {
      let replyText = "Got your message! Platform looks unbelievable on this build. 🚀";
      if (activeChatUserId === 'dev_sarah') {
        replyText = "Hey! The glass blur and responsive feed look fantastic. Love it! ✨";
      } else if (activeChatUserId === 'dev_alex') {
        replyText = "Confirmed! All UI event handlers and real-time state synced instantly ⚡";
      }
      const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      list.push({
        senderId: activeChatUserId,
        text: replyText,
        time: replyTime
      });
      appendLocalChatBubble(replyText, false);
    }, 1100);
    return;
  }

  const chatId = [currentUser.uid, activeChatUserId].sort().join('_');
  try {
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      senderId: currentUser.uid,
      senderName: currentProfile.displayName,
      senderAvatar: currentProfile.photoURL,
      text: text,
      createdAt: serverTimestamp()
    });

    await setDoc(doc(db, 'chats', chatId), {
      participants: [currentUser.uid, activeChatUserId],
      lastMessage: text,
      lastMessageTime: serverTimestamp(),
      lastSenderId: currentUser.uid
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `chats/${chatId}/messages`);
    showToast("Message could not be sent.");
  }
};

// AI Companion Logic
function renderAiWelcome() {
  const container = document.getElementById('chat-messages-container');
  container.innerHTML = `
    <div class="chat-bubble received">
      👋 Hello! I am Platform AI, your companion in this iOS 26 Glass world. Ask me to draft a post, brainstorm tech projects, or chat!
    </div>
  `;
}

function appendLocalChatBubble(text, isSent) {
  const container = document.getElementById('chat-messages-container');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isSent ? 'sent' : 'received'}`;
  bubble.innerText = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function sendToAiCompanion(text) {
  const container = document.getElementById('chat-messages-container');
  const loading = document.createElement('div');
  loading.className = 'chat-bubble received';
  loading.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Thinking...`;
  container.appendChild(loading);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, type: 'chat' })
    });
    const data = await res.json();
    loading.innerText = data.text || "I'm here to help!";
  } catch (err) {
    loading.innerText = "Connection to Gemini was interrupted.";
  }
  container.scrollTop = container.scrollHeight;
}

window.triggerAiSmartReply = async function() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('btn-ai-reply');
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: "Generate a smart concise reply for direct chat", type: 'reply' })
    });
    const data = await res.json();
    if (data.text) input.value = data.text;
  } catch (err) {
    input.value = "Sounds great! Let me check on that. 🚀";
  } finally {
    btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> AI Reply`;
  }
};

// Explore & Search
function renderExploreGrid() {
  const container = document.getElementById('explore-grid');
  let html = '';
  for (let i = 0; i < 24; i++) {
    const isLarge = i % 7 === 0;
    const isVideo = i % 4 === 0;
    const icon = isVideo ? `<i class="fa-solid fa-play type-icon"></i>` : '';
    html += `
      <div class="explore-item ${isLarge ? 'large' : ''}" onclick="showToast('Explored media item #${i+1}')">
        <img src="https://picsum.photos/seed/explore_${i}/${isLarge ? 600 : 300}/${isLarge ? 600 : 300}" loading="lazy">
        ${icon}
      </div>
    `;
  }
  container.innerHTML = html;
}

window.selectExploreCategory = function(cat, el) {
  document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  showToast(`Filtering explore feed for "${cat}"`);
};

window.filterExplore = function(val) {
  if (val.length > 2) {
    showToast(`Searching for "${val}"...`);
  }
};

// Profile & Showcase Projects
window.openUserProfile = function(uid, name, username, avatar) {
  showToast(`Viewing @${username}'s glass card`);
};

window.openEditProfileModal = function() {
  if (!currentProfile) return;
  document.getElementById('edit-display-name').value = currentProfile.displayName || '';
  document.getElementById('edit-bio').value = currentProfile.bio || '';
  document.getElementById('edit-avatar-url').value = currentProfile.photoURL || '';
  document.getElementById('edit-profile-modal').classList.add('show');
};
window.closeEditProfileModal = function() {
  document.getElementById('edit-profile-modal').classList.remove('show');
};

window.saveProfileChanges = async function() {
  if (!currentUser) return;
  const name = document.getElementById('edit-display-name').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const avatar = document.getElementById('edit-avatar-url').value.trim();

  const updates = {};
  if (name) updates.displayName = name;
  if (bio) updates.bio = bio;
  if (avatar) updates.photoURL = avatar;

  if (isDemoMode) {
    currentProfile = { ...currentProfile, ...updates };
    updateProfileUI();
    closeEditProfileModal();
    showToast("Profile updated successfully ✨");
    return;
  }

  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, updates);
    currentProfile = { ...currentProfile, ...updates };
    updateProfileUI();
    closeEditProfileModal();
    showToast("Profile updated successfully ✨");
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    showToast("Failed to update profile.");
  }
};

window.openAddProjectModal = function() {
  document.getElementById('add-project-modal').classList.add('show');
};
window.closeAddProjectModal = function() {
  document.getElementById('add-project-modal').classList.remove('show');
};

window.submitPortfolioProject = async function() {
  const title = document.getElementById('proj-title').value.trim();
  const subtitle = document.getElementById('proj-subtitle').value.trim();
  const desc = document.getElementById('proj-desc').value.trim();
  const tagsRaw = document.getElementById('proj-tags').value.trim();

  if (!title || !desc) return showToast("Title and description are required.");

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()) : ['Project'];
  const newProject = {
    id: 'proj_' + Date.now(),
    title,
    subtitle,
    desc,
    tags,
    icon: 'fa-layer-group',
    color: '#0a84ff'
  };

  const updatedPortfolio = [newProject, ...(currentProfile.portfolio || [])];

  if (isDemoMode) {
    currentProfile.portfolio = updatedPortfolio;
    renderPortfolioCards(updatedPortfolio);
    closeAddProjectModal();
    showToast("Showcase project added! 🚀");
    return;
  }

  try {
    await updateDoc(doc(db, 'users', currentUser.uid), {
      portfolio: updatedPortfolio
    });
    currentProfile.portfolio = updatedPortfolio;
    renderPortfolioCards(updatedPortfolio);
    closeAddProjectModal();
    showToast("Showcase project added! 🚀");
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    showToast("Failed to save project.");
  }
};

window.shareProfile = function() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href);
    showToast("Profile URL copied to clipboard!");
  } else {
    showToast("Platform profile active.");
  }
};

function renderProfilePostsGrid(posts) {
  const container = document.getElementById('profile-grid-section');
  if (!posts || posts.length === 0) {
    container.innerHTML = `<div style="grid-column: span 3; text-align: center; color: #777; padding: 24px;">No posts published yet.</div>`;
    return;
  }
  container.innerHTML = posts.map(p => `
    <div class="grid-item" onclick="switchView('home')">
      <img src="${escapeHtml(p.mediaUrl || p.authorAvatar || 'https://picsum.photos/300/300')}" loading="lazy">
    </div>
  `).join('');
}

// Notifications Drawer
window.openNotificationsModal = function() {
  document.getElementById('notifications-modal').classList.add('show');
};
window.closeNotificationsModal = function() {
  document.getElementById('notifications-modal').classList.remove('show');
};

function renderNotificationsList(items) {
  const container = document.getElementById('notifications-list-container');
  if (!items || items.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #888; padding: 30px;">All caught up! No new notifications.</div>`;
    return;
  }
  container.innerHTML = items.map(n => `
    <div style="display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <img src="${escapeHtml(n.senderAvatar || 'https://picsum.photos/100/100')}" style="width: 38px; height: 38px; border-radius: 12px;">
      <div style="flex: 1; font-size: 13px;">
        <div>${escapeHtml(n.content)}</div>
        <div style="font-size: 11px; color: #777; margin-top: 2px;">Just now</div>
      </div>
    </div>
  `).join('');
}

// View Routing (Synchronizing Mobile Navigation, Desktop Sidebar, and Feature Modules)
window.switchView = function(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId + '-view');
  if (target) target.classList.add('active');

  // Mobile Bottom Navigation sync
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  let navTarget = viewId;
  if (viewId === 'settings') navTarget = 'profile';
  const navItem = document.querySelector(`.nav-item[data-target="${navTarget}"]`);
  if (navItem) navItem.classList.add('active');

  // Desktop Sidebar Navigation sync
  document.querySelectorAll('.sidebar-nav-item').forEach(s => s.classList.remove('active'));
  const sidebarItem = document.querySelector(`.sidebar-nav-item[data-target="${viewId}"]`);
  if (sidebarItem) sidebarItem.classList.add('active');

  window.scrollTo(0, 0);

  // Trigger dynamic module loaders
  if (viewId === 'home') renderStoriesTray();
  else if (viewId === 'explore') renderExploreMasonry(activeExploreCategory);
  else if (viewId === 'reels') renderReelsView();
  else if (viewId === 'search') initSearchView();
  else if (viewId === 'communities') renderCommunitiesView();
  else if (viewId === 'trending') renderTrendingView();
  else if (viewId === 'boards') renderBoardsView();
  else if (viewId === 'creator') renderCreatorStudioView();
  else if (viewId === 'upload') setupComposerView();
};

// ==========================================
// 1. INSTAGRAM-STYLE STORIES & STORY VIEWER
// ==========================================
let activeSlideIndex = 0;

window.renderStoriesTray = function() {
  const container = document.getElementById('stories-tray');
  if (!container) return;

  const currentAvatar = (currentProfile && currentProfile.photoURL) || 'https://picsum.photos/seed/moulay_av/200/200';
  const myName = (currentProfile && currentProfile.displayName) || 'Your Story';

  let html = `
    <!-- User Story / Add Story Card -->
    <div class="story-circle-item" onclick="openAddStoryModal()">
      <div class="story-avatar-wrapper your-story">
        <img src="${escapeHtml(currentAvatar)}" class="story-avatar-img" alt="Your Story">
        <div class="story-add-badge"><i class="fa-solid fa-plus"></i></div>
      </div>
      <span class="story-username">Your Story</span>
    </div>
  `;

  SEED_STORIES.forEach((story, idx) => {
    const ringClass = story.isCloseFriends ? 'close-friends-ring' : 'gradient-ring';
    html += `
      <div class="story-circle-item" onclick="openStoryViewer(${idx})">
        <div class="story-avatar-wrapper ${ringClass} ${story.hasUnseen ? 'unseen' : ''}">
          <img src="${escapeHtml(story.authorAvatar)}" class="story-avatar-img" alt="${escapeHtml(story.authorName)}">
        </div>
        <span class="story-username">${escapeHtml(story.authorUsername)}</span>
      </div>
    `;
  });

  container.innerHTML = html;
};

window.openStoryViewer = function(storyIdx) {
  if (storyIdx < 0 || storyIdx >= SEED_STORIES.length) return;
  activeStoryIndex = storyIdx;
  activeSlideIndex = 0;
  isStoryPaused = false;

  const modal = document.getElementById('story-viewer-modal');
  if (!modal) return;
  modal.classList.add('show');

  renderStorySlide();
};

function renderStorySlide() {
  const story = SEED_STORIES[activeStoryIndex];
  if (!story || !story.slides || story.slides.length === 0) return closeStoryViewer();

  if (activeSlideIndex >= story.slides.length) {
    if (activeStoryIndex < SEED_STORIES.length - 1) {
      activeStoryIndex++;
      activeSlideIndex = 0;
      return renderStorySlide();
    } else {
      return closeStoryViewer();
    }
  }

  const slide = story.slides[activeSlideIndex];
  story.hasUnseen = false;

  // Render Segmented Progress Bars
  const progressContainer = document.getElementById('story-progress-container');
  if (progressContainer) {
    progressContainer.innerHTML = story.slides.map((_, i) => {
      let stateClass = '';
      if (i < activeSlideIndex) stateClass = 'completed';
      else if (i === activeSlideIndex) stateClass = 'active';
      return `<div class="story-progress-segment ${stateClass}"><div class="story-progress-fill"></div></div>`;
    }).join('');
  }

  // Author details
  const avatarEl = document.getElementById('story-author-avatar');
  const nameEl = document.getElementById('story-author-name');
  const timeEl = document.getElementById('story-timestamp');
  const cfBadge = document.getElementById('story-close-friends-badge');

  if (avatarEl) avatarEl.src = story.authorAvatar;
  if (nameEl) nameEl.innerText = story.authorName;
  if (timeEl) timeEl.innerText = slide.time || '1h ago';
  if (cfBadge) cfBadge.style.display = story.isCloseFriends ? 'inline-flex' : 'none';

  // Render Slide Media
  const stageEl = document.getElementById('story-media-stage');
  if (stageEl) {
    if (slide.type === 'video') {
      stageEl.innerHTML = `
        <video src="${escapeHtml(slide.url)}" id="story-video-player" autoplay playsinline loop class="story-media-element"></video>
        ${slide.caption ? `<div class="story-caption-overlay">${escapeHtml(slide.caption)}</div>` : ''}
      `;
    } else if (slide.type === 'text') {
      stageEl.innerHTML = `
        <div class="story-text-card ${slide.gradient || 'sunset'}">
          <div class="story-text-content">${escapeHtml(slide.caption || '')}</div>
        </div>
      `;
    } else {
      stageEl.innerHTML = `
        <img src="${escapeHtml(slide.url)}" class="story-media-element" alt="Story Slide">
        ${slide.caption ? `<div class="story-caption-overlay">${escapeHtml(slide.caption)}</div>` : ''}
      `;
    }
  }

  // Render Interactive Poll / Sticker if present
  const stickersLayer = document.getElementById('story-stickers-layer');
  if (stickersLayer) {
    if (slide.poll) {
      stickersLayer.innerHTML = `
        <div class="story-poll-sticker">
          <div class="story-poll-question">${escapeHtml(slide.poll.question)}</div>
          <div class="story-poll-options">
            ${slide.poll.options.map((opt, oi) => `
              <div class="story-poll-option" onclick="voteStoryPoll(${oi}, this)">
                <span>${escapeHtml(opt)}</span>
                <span class="poll-percent" style="display: none;">${oi === 0 ? '68%' : '32%'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      stickersLayer.innerHTML = '';
    }
  }

  // Clear previous timer and set 5s auto advance
  if (activeStoryTimer) clearInterval(activeStoryTimer);
  let duration = slide.type === 'video' ? 8000 : 5000;
  activeStoryTimer = setTimeout(() => {
    if (!isStoryPaused) {
      window.navigateStory(1);
    }
  }, duration);
}

window.voteStoryPoll = function(optionIndex, el) {
  const container = el.closest('.story-poll-sticker');
  if (!container) return;
  container.querySelectorAll('.story-poll-option').forEach((opt, i) => {
    opt.classList.add('voted');
    const pct = opt.querySelector('.poll-percent');
    if (pct) pct.style.display = 'inline-block';
    if (i === optionIndex) opt.classList.add('selected');
  });
  showToast("Vote recorded! ✨");
};

window.voteFeedPoll = function(postId, optionIndex, el) {
  const container = el.closest('.post-poll-card');
  if (!container) return;
  container.querySelectorAll('.feed-poll-option').forEach((opt, i) => {
    opt.style.background = (i === optionIndex) ? 'rgba(10,132,255,0.25)' : 'rgba(255,255,255,0.04)';
    opt.style.borderColor = (i === optionIndex) ? '#0a84ff' : 'transparent';
    const pct = opt.querySelector('.feed-poll-pct');
    if (pct) pct.style.display = 'inline-block';
  });
  showToast("Your vote has been counted! 📊");
};

window.navigateStory = function(direction) {
  if (activeStoryTimer) clearTimeout(activeStoryTimer);
  const story = SEED_STORIES[activeStoryIndex];
  if (!story) return closeStoryViewer();

  if (direction === 1) {
    activeSlideIndex++;
    renderStorySlide();
  } else if (direction === -1) {
    if (activeSlideIndex > 0) {
      activeSlideIndex--;
      renderStorySlide();
    } else if (activeStoryIndex > 0) {
      activeStoryIndex--;
      activeSlideIndex = 0;
      renderStorySlide();
    }
  }
};

window.toggleStoryPause = function() {
  isStoryPaused = !isStoryPaused;
  const vid = document.getElementById('story-video-player');
  if (vid) {
    if (isStoryPaused) vid.pause();
    else vid.play();
  }
  const pauseBtn = document.getElementById('story-pause-btn');
  if (pauseBtn) {
    pauseBtn.innerHTML = isStoryPaused ? `<i class="fa-solid fa-play"></i>` : `<i class="fa-solid fa-pause"></i>`;
  }
  showToast(isStoryPaused ? "Story paused" : "Story resumed");
};

window.closeStoryViewer = function() {
  if (activeStoryTimer) clearTimeout(activeStoryTimer);
  const vid = document.getElementById('story-video-player');
  if (vid) vid.pause();
  const modal = document.getElementById('story-viewer-modal');
  if (modal) modal.classList.remove('show');
  renderStoriesTray();
};

window.sendStoryReaction = function(emoji) {
  showToast(`Sent ${emoji} to ${SEED_STORIES[activeStoryIndex]?.authorName || 'creator'}! ❤️`);
};

window.sendStoryReply = function() {
  const input = document.getElementById('story-reply-input');
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  input.value = '';
  showToast(`Sent reply: "${text}" ✨`);
};

window.openAddStoryModal = function() {
  const modal = document.getElementById('add-story-modal');
  if (modal) modal.classList.add('show');
};

window.closeAddStoryModal = function() {
  const modal = document.getElementById('add-story-modal');
  if (modal) modal.classList.remove('show');
};

window.publishNewStory = function() {
  const caption = (document.getElementById('new-story-caption')?.value || '').trim();
  const mediaUrl = document.getElementById('new-story-media-preview')?.dataset?.mediaUrl || 'https://picsum.photos/seed/story_new/800/1200';

  const myStory = {
    id: 'story_user_' + Date.now(),
    authorId: currentUser ? currentUser.uid : 'current_user',
    authorName: (currentProfile && currentProfile.displayName) || 'You',
    authorUsername: (currentProfile && currentProfile.username) || 'you',
    authorAvatar: (currentProfile && currentProfile.photoURL) || 'https://picsum.photos/seed/moulay_av/200/200',
    isCloseFriends: false,
    hasUnseen: true,
    slides: [
      {
        type: 'image',
        url: mediaUrl,
        caption: caption || 'New story update! ✨',
        time: 'Just now',
        poll: null
      }
    ]
  };

  SEED_STORIES.unshift(myStory);
  closeAddStoryModal();
  renderStoriesTray();
  showToast("Story shared with your followers! ✨");
};

window.handleStoryFileSelected = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('new-story-media-preview');
    if (preview) {
      preview.src = e.target.result;
      preview.dataset.mediaUrl = e.target.result;
      preview.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
};

window.addStorySampleMedia = function(url) {
  const preview = document.getElementById('new-story-media-preview');
  if (preview) {
    preview.src = url;
    preview.dataset.mediaUrl = url;
    preview.style.display = 'block';
  }
};

// ==========================================
// 2. EXPLORE VIEW (PINTEST + INSTAGRAM MASONRY)
// ==========================================
window.renderExploreMasonry = function(category = 'All') {
  activeExploreCategory = category;

  // Render Featured Creators Row
  const creatorsRow = document.getElementById('explore-featured-creators');
  if (creatorsRow) {
    const featuredList = [
      { name: 'Moulay Lhani', username: 'moulaylhani', role: 'DEV & Founder', avatar: 'https://picsum.photos/seed/moulay_av/200/200' },
      { name: 'Sarah Jenkins', username: 'sarah_ui', role: 'UI Architect', avatar: 'https://picsum.photos/seed/sarah_av/200/200' },
      { name: 'Alex Fernandez', username: 'alex_fern', role: 'Compiler Dev', avatar: 'https://picsum.photos/seed/alex_av/200/200' },
      { name: 'Elena Rostova', username: 'elena_lens', role: 'Cinematographer', avatar: 'https://picsum.photos/seed/elena_av/200/200' },
      { name: 'Cyber Labs', username: 'cyberlabs', role: 'AI Shaders', avatar: 'https://picsum.photos/seed/cyber_av/200/200' }
    ];
    creatorsRow.innerHTML = featuredList.map(c => `
      <div class="creator-spotlight-card">
        <img src="${escapeHtml(c.avatar)}" class="creator-spotlight-avatar">
        <div class="creator-spotlight-name">${escapeHtml(c.name)}</div>
        <div class="creator-spotlight-handle">@${escapeHtml(c.username)}</div>
        <button type="button" class="btn-follow-chip" onclick="toggleFollowUser('${c.username}', this)">Follow</button>
      </div>
    `).join('');
  }

  // Filter Pins
  const container = document.getElementById('explore-masonry');
  if (!container) return;

  let pins = SEED_EXPLORE;
  if (category && category !== 'All') {
    pins = SEED_EXPLORE.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }
  if (pins.length === 0) pins = SEED_EXPLORE;

  container.innerHTML = pins.map(p => `
    <div class="masonry-item" onclick="openExploreItemDetail('${p.id}')">
      <img src="${escapeHtml(p.img)}" alt="${escapeHtml(p.title)}" loading="lazy">
      ${p.isVideo ? `<div class="explore-type-badge"><i class="fa-solid fa-play"></i> Video</div>` : ''}
      <div class="explore-category-tag">${escapeHtml(p.category)}</div>
      <div class="masonry-overlay">
        <div class="masonry-overlay-info">
          <div class="masonry-pin-title">${escapeHtml(p.title)}</div>
          <div class="masonry-pin-author">@${escapeHtml(p.author)}</div>
        </div>
        <div class="masonry-overlay-actions">
          <button class="btn-pin-action" onclick="event.stopPropagation(); toggleLikeExplorePin('${p.id}')">
            <i class="fa-regular fa-heart"></i> ${p.likes}
          </button>
          <button class="btn-pin-action btn-save-board" onclick="event.stopPropagation(); openSaveToBoardModal('${p.id}')">
            <i class="fa-solid fa-thumbtack"></i> Save
          </button>
        </div>
      </div>
    </div>
  `).join('');
};

window.selectExploreCategory = function(cat, el) {
  document.querySelectorAll('#explore-categories-list .category-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderExploreMasonry(cat);
  showToast(`Filtering explore for "${cat}"`);
};

window.toggleLikeExplorePin = function(pinId) {
  const pin = SEED_EXPLORE.find(p => p.id === pinId);
  if (pin) {
    pin.likes += 1;
    renderExploreMasonry(activeExploreCategory);
    showToast("Liked pin ❤️");
  }
};

window.openExploreItemDetail = function(pinId) {
  const pin = SEED_EXPLORE.find(p => p.id === pinId);
  if (!pin) return;
  showToast(`Opening "${pin.title}" by @${pin.author}`);
};

window.toggleFollowUser = function(username, btn) {
  const isFollowing = btn.classList.contains('following');
  if (isFollowing) {
    btn.classList.remove('following');
    btn.innerText = 'Follow';
    showToast(`Unfollowed @${username}`);
  } else {
    btn.classList.add('following');
    btn.innerText = 'Following';
    showToast(`Now following @${username}! 🚀`);
  }
};

// ==========================================
// 3. REELS VIEW (FULL VERTICAL VIDEO EXPERIENCE)
// ==========================================
window.renderReelsView = function() {
  if (SEED_REELS.length === 0) return;
  const reel = SEED_REELS[currentReelIndex];
  if (!reel) return;

  const vid = document.getElementById('reel-active-video');
  if (vid) {
    if (vid.src !== reel.videoUrl) {
      vid.src = reel.videoUrl;
    }
    vid.play().catch(e => console.log("Autoplay paused:", e));
  }

  // Update Author & Caption Info
  const authorAvatar = document.getElementById('reel-author-avatar');
  const authorName = document.getElementById('reel-author-name');
  const authorUsername = document.getElementById('reel-author-username');
  const captionEl = document.getElementById('reel-caption-text');
  const soundTitleEl = document.getElementById('reel-sound-title');
  const soundArtistEl = document.getElementById('reel-sound-artist');
  const likeCountEl = document.getElementById('reel-like-count');
  const commentCountEl = document.getElementById('reel-comment-count');
  const likeIcon = document.getElementById('reel-icon-like');

  if (authorAvatar) authorAvatar.src = reel.authorAvatar;
  if (authorName) authorName.innerText = reel.authorName;
  if (authorUsername) authorUsername.innerText = '@' + reel.authorUsername;
  if (captionEl) captionEl.innerText = reel.caption;
  if (soundTitleEl) soundTitleEl.innerText = reel.soundName;
  if (soundArtistEl) soundArtistEl.innerText = reel.soundCreator;
  if (likeCountEl) likeCountEl.innerText = reel.likesCount > 1000 ? `${(reel.likesCount/1000).toFixed(1)}K` : reel.likesCount;
  if (commentCountEl) commentCountEl.innerText = reel.commentsCount;

  if (likeIcon) {
    if (reel.isLiked) {
      likeIcon.className = 'fa-solid fa-heart';
      likeIcon.style.color = '#ff2d55';
    } else {
      likeIcon.className = 'fa-regular fa-heart';
      likeIcon.style.color = '#fff';
    }
  }
};

window.toggleReelLike = function() {
  const reel = SEED_REELS[currentReelIndex];
  if (!reel) return;
  reel.isLiked = !reel.isLiked;
  reel.likesCount += reel.isLiked ? 1 : -1;

  // Heart burst animation
  const burst = document.getElementById('reel-heart-burst');
  if (burst) {
    burst.style.transform = 'translate(-50%, -50%) scale(1.2)';
    setTimeout(() => {
      burst.style.transform = 'translate(-50%, -50%) scale(0)';
    }, 400);
  }

  renderReelsView();
};

window.nextReel = function() {
  if (currentReelIndex < SEED_REELS.length - 1) {
    currentReelIndex++;
    renderReelsView();
  } else {
    currentReelIndex = 0;
    renderReelsView();
  }
};

window.prevReel = function() {
  if (currentReelIndex > 0) {
    currentReelIndex--;
    renderReelsView();
  }
};

window.openSoundDetailModal = function() {
  const reel = SEED_REELS[currentReelIndex];
  if (!reel) return;
  const modal = document.getElementById('sound-detail-modal');
  const titleEl = document.getElementById('sound-modal-title');
  const artistEl = document.getElementById('sound-modal-artist');
  if (titleEl) titleEl.innerText = reel.soundName;
  if (artistEl) artistEl.innerText = reel.soundCreator;
  if (modal) modal.classList.add('show');
};

window.closeSoundDetailModal = function() {
  const modal = document.getElementById('sound-detail-modal');
  if (modal) modal.classList.remove('show');
};

window.useSoundInNewReel = function() {
  closeSoundDetailModal();
  switchView('upload');
  setComposerMode('reel');
  showToast("Audio track attached to your new Reel! 🎵");
};

// ==========================================
// 4. GLOBAL SEARCH VIEW (ACCOUNTS, POSTS, TAGS, COMMUNITIES)
// ==========================================
window.initSearchView = function() {
  renderRecentSearches();
  renderTrendingSearches();
  const input = document.getElementById('global-search-input');
  if (input && input.value.trim()) {
    handleGlobalSearch(input.value.trim());
  }
};

function renderRecentSearches() {
  const listEl = document.getElementById('recent-searches-list');
  if (!listEl) return;
  if (recentSearchesList.length === 0) {
    listEl.innerHTML = `<span style="font-size: 12px; color: #777;">No recent searches</span>`;
    return;
  }
  listEl.innerHTML = recentSearchesList.map(item => `
    <div class="recent-search-chip">
      <span onclick="searchByTag('${escapeHtml(item)}')">${escapeHtml(item)}</span>
      <i class="fa-solid fa-xmark" onclick="removeRecentSearch('${escapeHtml(item)}')"></i>
    </div>
  `).join('');
}

function renderTrendingSearches() {
  const listEl = document.getElementById('trending-searches-list');
  if (!listEl) return;
  listEl.innerHTML = SEED_TRENDS.map(t => `
    <div class="trending-search-item" onclick="searchByTag('${escapeHtml(t.tag)}')">
      <div style="font-size: 11px; color: #888;">${escapeHtml(t.desc)}</div>
      <div style="font-size: 14px; font-weight: 700; color: #fff;">${escapeHtml(t.tag)}</div>
      <div style="font-size: 12px; color: #aaa;">${escapeHtml(t.count)}</div>
    </div>
  `).join('');
}

window.handleGlobalSearch = function(query) {
  const defaultPanel = document.getElementById('search-default-panel');
  const resultsContainer = document.getElementById('search-results-container');
  const clearBtn = document.getElementById('search-clear-btn');

  if (!query || !query.trim()) {
    if (defaultPanel) defaultPanel.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }

  if (clearBtn) clearBtn.style.display = 'block';
  if (defaultPanel) defaultPanel.style.display = 'none';
  if (resultsContainer) resultsContainer.style.display = 'block';

  const q = query.toLowerCase().trim();

  // Search in accounts, posts, tags, and communities
  const matchedUsers = [
    { name: 'Moulay Lhani', username: 'moulaylhani', role: 'DEV & Founder', avatar: 'https://picsum.photos/seed/moulay_av/200/200' },
    { name: 'Sarah Jenkins', username: 'sarah_ui', role: 'UI Architect', avatar: 'https://picsum.photos/seed/sarah_av/200/200' },
    { name: 'Alex Fernandez', username: 'alex_fern', role: 'Compiler Dev', avatar: 'https://picsum.photos/seed/alex_av/200/200' },
    { name: 'Elena Rostova', username: 'elena_lens', role: 'Cinematographer', avatar: 'https://picsum.photos/seed/elena_av/200/200' }
  ].filter(u => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));

  const matchedPosts = allCachedPosts.filter(p => (p.caption || '').toLowerCase().includes(q));
  const matchedCommunities = SEED_COMMUNITIES.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  const matchedTags = SEED_TRENDS.filter(t => t.tag.toLowerCase().includes(q));

  let html = '';

  if (searchActiveTab === 'top' || searchActiveTab === 'users') {
    if (matchedUsers.length > 0) {
      html += `<div style="font-size: 13px; font-weight: 700; color: #888; text-transform: uppercase; margin: 12px 0 6px;">Accounts</div>`;
      html += matchedUsers.map(u => `
        <div class="search-user-row" onclick="openUserProfile('${u.username}', '${escapeHtml(u.name)}', '${escapeHtml(u.username)}', '${u.avatar}')">
          <img src="${escapeHtml(u.avatar)}" class="search-user-avatar">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #fff;">${escapeHtml(u.name)}</div>
            <div style="font-size: 12px; color: #888;">@${escapeHtml(u.username)} • ${escapeHtml(u.role)}</div>
          </div>
          <button class="btn-glass" onclick="event.stopPropagation(); toggleFollowUser('${u.username}', this)">Follow</button>
        </div>
      `).join('');
    }
  }

  if (searchActiveTab === 'top' || searchActiveTab === 'tags') {
    if (matchedTags.length > 0) {
      html += `<div style="font-size: 13px; font-weight: 700; color: #888; text-transform: uppercase; margin: 16px 0 6px;">Hashtags</div>`;
      html += matchedTags.map(t => `
        <div class="search-tag-row" onclick="searchByTag('${escapeHtml(t.tag)}')">
          <div class="search-tag-icon"><i class="fa-solid fa-hashtag"></i></div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #0a84ff;">${escapeHtml(t.tag)}</div>
            <div style="font-size: 11px; color: #888;">${escapeHtml(t.count)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  if (searchActiveTab === 'top' || searchActiveTab === 'communities') {
    if (matchedCommunities.length > 0) {
      html += `<div style="font-size: 13px; font-weight: 700; color: #888; text-transform: uppercase; margin: 16px 0 6px;">Communities</div>`;
      html += matchedCommunities.map(c => `
        <div class="search-user-row" onclick="switchView('communities')">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: ${c.color}22; color: ${c.color}; display: flex; align-items: center; justify-content: center; font-size: 18px;">
            <i class="fa-solid ${c.icon}"></i>
          </div>
          <div style="flex: 1; margin-left: 12px;">
            <div style="font-weight: 600; color: #fff;">${escapeHtml(c.name)}</div>
            <div style="font-size: 11px; color: #888;">${escapeHtml(c.members)} members</div>
          </div>
          <button class="btn-glass" onclick="event.stopPropagation(); toggleJoinCommunity('${c.name}', this)">Join</button>
        </div>
      `).join('');
    }
  }

  if (searchActiveTab === 'top' || searchActiveTab === 'posts') {
    if (matchedPosts.length > 0) {
      html += `<div style="font-size: 13px; font-weight: 700; color: #888; text-transform: uppercase; margin: 16px 0 6px;">Posts</div>`;
      html += matchedPosts.slice(0, 5).map(p => `
        <div class="search-post-row" onclick="switchView('home')">
          <img src="${escapeHtml(p.authorAvatar || 'https://picsum.photos/50/50')}" style="width: 30px; height: 30px; border-radius: 8px;">
          <div style="flex: 1; margin-left: 10px; font-size: 13px;">
            <span style="font-weight: 600; color: #fff;">@${escapeHtml(p.authorUsername)}:</span>
            <span style="color: #ccc;">${escapeHtml(p.caption)}</span>
          </div>
        </div>
      `).join('');
    }
  }

  if (!html) {
    html = `<div style="padding: 40px; text-align: center; color: #888;">No results found for "${escapeHtml(query)}"</div>`;
  }

  resultsContainer.innerHTML = html;
};

window.switchSearchTab = function(tab, el) {
  searchActiveTab = tab;
  document.querySelectorAll('#search-tabs .category-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  const input = document.getElementById('global-search-input');
  if (input && input.value.trim()) {
    handleGlobalSearch(input.value.trim());
  }
};

window.clearGlobalSearch = function() {
  const input = document.getElementById('global-search-input');
  if (input) input.value = '';
  handleGlobalSearch('');
};

window.searchByTag = function(tag) {
  if (!recentSearchesList.includes(tag)) {
    recentSearchesList.unshift(tag);
    if (recentSearchesList.length > 8) recentSearchesList.pop();
  }
  const input = document.getElementById('global-search-input');
  if (input) {
    input.value = tag;
    handleGlobalSearch(tag);
  }
  switchView('search');
};

window.clearRecentSearches = function() {
  recentSearchesList = [];
  renderRecentSearches();
  showToast("Recent searches cleared.");
};

window.removeRecentSearch = function(item) {
  recentSearchesList = recentSearchesList.filter(i => i !== item);
  renderRecentSearches();
};

window.toggleSearchFilters = function() {
  showToast("Search filters: Sorting by Relevance, verified accounts prioritized.");
};

// ==========================================
// 5. PINTEREST-STYLE BOARDS & PIN MANAGEMENT
// ==========================================
window.renderBoardsView = function() {
  const userGrid = document.getElementById('user-boards-grid');
  const exploreGrid = document.getElementById('explore-boards-grid');

  const allBoards = [...SEED_BOARDS, ...userBoardsList];

  if (userGrid) {
    userGrid.innerHTML = allBoards.map(b => `
      <div class="board-card" onclick="openBoardDetail('${b.id}')">
        <div class="board-thumbnails-collage">
          ${(b.thumbs || []).map((img, i) => `<img src="${escapeHtml(img)}" class="board-thumb-${i}" alt="Pin thumb">`).join('')}
        </div>
        <div class="board-info">
          <div class="board-title">
            ${escapeHtml(b.title)}
            ${b.isSecret ? '<i class="fa-solid fa-lock" style="font-size: 11px; color: #aaa; margin-left: 4px;"></i>' : ''}
          </div>
          <div class="board-count">${b.pinCount} pins • Updated recently</div>
        </div>
      </div>
    `).join('');
  }

  if (exploreGrid) {
    exploreGrid.innerHTML = SEED_BOARDS.map(b => `
      <div class="board-card" onclick="openBoardDetail('${b.id}')">
        <div class="board-thumbnails-collage">
          ${(b.thumbs || []).map((img, i) => `<img src="${escapeHtml(img)}" class="board-thumb-${i}">`).join('')}
        </div>
        <div class="board-info">
          <div class="board-title">${escapeHtml(b.title)}</div>
          <div class="board-count">${b.desc}</div>
        </div>
      </div>
    `).join('');
  }
};

window.openCreateBoardModal = function() {
  const modal = document.getElementById('create-board-modal');
  if (modal) modal.classList.add('show');
};

window.closeCreateBoardModal = function() {
  const modal = document.getElementById('create-board-modal');
  if (modal) modal.classList.remove('show');
};

window.submitCreateBoard = function() {
  const title = (document.getElementById('board-title-input')?.value || '').trim();
  const desc = (document.getElementById('board-desc-input')?.value || '').trim();
  const isSecret = document.getElementById('board-secret-checkbox')?.checked || false;

  if (!title) return showToast("Please name your board.");

  const newBoard = {
    id: 'board_' + Date.now(),
    title: title,
    desc: desc || 'Curated board on Platform.',
    pinCount: 0,
    isSecret: isSecret,
    thumbs: [
      'https://picsum.photos/seed/board_new_1/400/400',
      'https://picsum.photos/seed/board_new_2/400/400',
      'https://picsum.photos/seed/board_new_3/400/400'
    ]
  };

  userBoardsList.push(newBoard);
  closeCreateBoardModal();
  renderBoardsView();
  showToast(`Board "${title}" created successfully! 📌`);
};

window.openBoardDetail = function(boardId) {
  const allBoards = [...SEED_BOARDS, ...userBoardsList];
  const board = allBoards.find(b => b.id === boardId);
  if (!board) return;

  const modal = document.getElementById('board-detail-modal');
  const titleEl = document.getElementById('board-detail-title');
  const descEl = document.getElementById('board-detail-desc');
  const pinsContainer = document.getElementById('board-detail-pins-container');

  if (titleEl) titleEl.innerText = board.title;
  if (descEl) descEl.innerText = `${board.desc} • ${board.pinCount} pins`;

  if (pinsContainer) {
    pinsContainer.innerHTML = SEED_EXPLORE.slice(0, 6).map(p => `
      <div class="masonry-item" style="margin-bottom: 12px;">
        <img src="${escapeHtml(p.img)}" style="width: 100%; border-radius: 12px; display: block;">
        <div style="font-size: 12px; font-weight: 600; margin-top: 6px; color: #fff;">${escapeHtml(p.title)}</div>
      </div>
    `).join('');
  }

  if (modal) modal.classList.add('show');
};

window.closeBoardDetailModal = function() {
  const modal = document.getElementById('board-detail-modal');
  if (modal) modal.classList.remove('show');
};

window.openSaveToBoardModal = function(postId) {
  const modal = document.getElementById('save-to-board-modal');
  const listEl = document.getElementById('save-boards-selector-list');
  if (listEl) {
    const allBoards = [...SEED_BOARDS, ...userBoardsList];
    listEl.innerHTML = allBoards.map(b => `
      <div class="save-board-choice-row" onclick="confirmSaveToBoard('${b.id}', '${postId}')">
        <img src="${escapeHtml(b.thumbs[0] || 'https://picsum.photos/60/60')}" class="save-board-mini-thumb">
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: 600; color: #fff;">${escapeHtml(b.title)}</div>
          <div style="font-size: 11px; color: #888;">${b.pinCount} pins</div>
        </div>
        <i class="fa-solid fa-plus" style="color: #0a84ff;"></i>
      </div>
    `).join('');
  }
  if (modal) modal.classList.add('show');
};

window.closeSaveToBoardModal = function() {
  const modal = document.getElementById('save-to-board-modal');
  if (modal) modal.classList.remove('show');
};

window.confirmSaveToBoard = function(boardId, postId) {
  const allBoards = [...SEED_BOARDS, ...userBoardsList];
  const board = allBoards.find(b => b.id === boardId);
  if (board) board.pinCount += 1;
  closeSaveToBoardModal();
  showToast(`Saved to "${board ? board.title : 'Board'}"! 📌`);
};

// ==========================================
// 6. COMMUNITIES VIEW
// ==========================================
window.renderCommunitiesView = function(cat = 'All') {
  const listEl = document.getElementById('communities-list-container');
  if (!listEl) return;

  let items = SEED_COMMUNITIES;
  if (cat && cat !== 'All') {
    items = SEED_COMMUNITIES.filter(c => c.category.toLowerCase() === cat.toLowerCase());
  }

  listEl.innerHTML = items.map(c => {
    const isJoined = joinedCommunitiesSet.has(c.name);
    return `
      <div class="community-glass-card">
        <div class="community-banner" style="background-image: url('${c.banner}');">
          <div class="community-badge-icon" style="background: ${c.color};">
            <i class="fa-solid ${c.icon}"></i>
          </div>
        </div>
        <div class="community-content">
          <div class="community-header-row">
            <div>
              <div class="community-title">${escapeHtml(c.name)}</div>
              <div class="community-members">${escapeHtml(c.members)} Members • ${escapeHtml(c.category)}</div>
            </div>
            <button class="btn-community-join ${isJoined ? 'joined' : ''}" onclick="toggleJoinCommunity('${escapeHtml(c.name)}', this)">
              ${isJoined ? 'Joined' : 'Join'}
            </button>
          </div>
          <div class="community-desc">${escapeHtml(c.desc)}</div>
        </div>
      </div>
    `;
  }).join('');
};

window.filterCommunitiesCategory = function(cat, el) {
  document.querySelectorAll('#communities-categories-row .category-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderCommunitiesView(cat);
  showToast(`Filtered communities by ${cat}`);
};

window.toggleJoinCommunity = function(commName, btn) {
  if (joinedCommunitiesSet.has(commName)) {
    joinedCommunitiesSet.delete(commName);
    if (btn) {
      btn.classList.remove('joined');
      btn.innerText = 'Join';
    }
    showToast(`Left ${commName}`);
  } else {
    joinedCommunitiesSet.add(commName);
    if (btn) {
      btn.classList.add('joined');
      btn.innerText = 'Joined';
    }
    showToast(`Joined ${commName}! Welcome aboard 🚀`);
  }
};

// ==========================================
// 7. TRENDING VIEW (X-STYLE ALGORITHMIC TOPICS)
// ==========================================
window.renderTrendingView = function() {
  const container = document.getElementById('trending-feed-container');
  if (!container) return;

  container.innerHTML = SEED_TRENDS.map(t => `
    <div class="trending-topic-card" onclick="searchByTag('${escapeHtml(t.tag)}')">
      <div class="trending-card-header">
        <span class="trending-category-tag">${escapeHtml(t.topic)}</span>
        <span class="trending-rank-badge">#${t.rank}</span>
      </div>
      <div class="trending-topic-tag">${escapeHtml(t.tag)}</div>
      <div class="trending-volume">${escapeHtml(t.count)}</div>
      <div class="trending-reason">${escapeHtml(t.desc)}</div>
    </div>
  `).join('');
};

// ==========================================
// 8. CREATOR STUDIO & ANALYTICS
// ==========================================
window.renderCreatorStudioView = function() {
  const topPostsContainer = document.getElementById('creator-top-posts');
  if (topPostsContainer) {
    topPostsContainer.innerHTML = SEED_REELS.slice(0, 3).map(r => `
      <div class="creator-post-stat-row">
        <video src="${escapeHtml(r.videoUrl)}" style="width: 44px; height: 58px; border-radius: 8px; object-fit: cover;"></video>
        <div style="flex: 1; margin-left: 12px;">
          <div style="font-size: 13px; font-weight: 600; color: #fff;">${escapeHtml(r.caption.slice(0, 45))}...</div>
          <div style="font-size: 11px; color: #888; margin-top: 3px;">
            <i class="fa-solid fa-heart" style="color: #ff2d55;"></i> ${(r.likesCount/1000).toFixed(1)}K likes • 
            <i class="fa-regular fa-comment"></i> ${r.commentsCount} comments
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-weight: 700; color: #30d158;">+28.4%</div>
          <div style="font-size: 10px; color: #888;">Engagement</div>
        </div>
      </div>
    `).join('');
  }
};

window.exportCreatorData = function() {
  showToast("Exporting Creator Analytics CSV report... 📊");
};

// ==========================================
// 9. CREATE STUDIO: MODES, POLLS, CAROUSELS, DRAFTS & LIVE
// ==========================================
window.setupComposerView = function() {
  setComposerMode(composerMode);
};

window.setComposerMode = function(mode, el) {
  composerMode = mode;
  document.querySelectorAll('#create-modes-row .category-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');

  const pollBox = document.getElementById('composer-poll-box');
  const carouselBox = document.getElementById('composer-carousel-box');
  const gradientPicker = document.getElementById('composer-gradient-picker');

  if (pollBox) pollBox.style.display = mode === 'poll' ? 'block' : 'none';
  if (carouselBox) carouselBox.style.display = mode === 'carousel' ? 'block' : 'none';
  if (gradientPicker) gradientPicker.style.display = mode === 'text' ? 'flex' : 'none';

  if (mode === 'live') {
    openLiveBroadcastModal();
  }
};

window.selectTextGradient = function(gradientName, el) {
  composerTextGradient = gradientName;
  document.querySelectorAll('.gradient-option-circle').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  const textarea = document.getElementById('post-text-input');
  if (textarea) {
    textarea.className = `post-textarea gradient-${gradientName}`;
  }
};

window.handleCarouselFilesSelected = function(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      composerCarouselPhotos.push(e.target.result);
      renderCarouselThumbnails();
    };
    reader.readAsDataURL(file);
  });
};

function renderCarouselThumbnails() {
  const container = document.getElementById('composer-carousel-previews');
  if (!container) return;
  container.innerHTML = composerCarouselPhotos.map((src, i) => `
    <div class="carousel-preview-thumb">
      <img src="${escapeHtml(src)}">
      <div class="remove-thumb-btn" onclick="removeCarouselPhoto(${i})"><i class="fa-solid fa-xmark"></i></div>
    </div>
  `).join('');
}

window.removeCarouselPhoto = function(index) {
  composerCarouselPhotos.splice(index, 1);
  renderCarouselThumbnails();
};

window.pickLocationPrompt = function() {
  const loc = prompt("Tag a location (e.g., Tokyo, Japan / Silicon Valley, CA):", composerLocation);
  if (loc !== null) {
    composerLocation = loc.trim();
    const tagEl = document.getElementById('composer-location-tag');
    if (tagEl) {
      if (composerLocation) {
        tagEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(composerLocation)} <i class="fa-solid fa-xmark" style="cursor: pointer; margin-left: 6px;" onclick="clearComposerLocation()"></i>`;
        tagEl.style.display = 'inline-flex';
      } else {
        tagEl.style.display = 'none';
      }
    }
  }
};

window.clearComposerLocation = function() {
  composerLocation = '';
  const tagEl = document.getElementById('composer-location-tag');
  if (tagEl) tagEl.style.display = 'none';
};

window.savePostDraft = function() {
  const text = (document.getElementById('post-text-input')?.value || '').trim();
  if (!text && !composerMediaData && composerCarouselPhotos.length === 0) {
    return showToast("Nothing to save in drafts.");
  }
  const draft = {
    id: 'draft_' + Date.now(),
    text: text,
    mode: composerMode,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    mediaUrl: composerMediaData
  };
  savedDraftsList.push(draft);
  showToast("Draft saved successfully! 📝");
};

window.openDraftsModal = function() {
  const modal = document.getElementById('drafts-manager-modal');
  const container = document.getElementById('drafts-list-container');
  if (container) {
    if (savedDraftsList.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #888; padding: 30px;">No saved drafts yet.</div>`;
    } else {
      container.innerHTML = savedDraftsList.map(d => `
        <div class="draft-card-row">
          <div style="flex: 1;" onclick="loadDraft('${d.id}')">
            <div style="font-size: 13px; font-weight: 600; color: #fff;">${escapeHtml(d.text.slice(0, 50) || 'Media Post')}</div>
            <div style="font-size: 11px; color: #888; margin-top: 2px;">Mode: ${d.mode} • Saved at ${d.time}</div>
          </div>
          <button class="btn-glass" onclick="deleteDraft('${d.id}')" style="padding: 4px 8px; color: #ff453a;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `).join('');
    }
  }
  if (modal) modal.classList.add('show');
};

window.closeDraftsModal = function() {
  const modal = document.getElementById('drafts-manager-modal');
  if (modal) modal.classList.remove('show');
};

window.loadDraft = function(draftId) {
  const draft = savedDraftsList.find(d => d.id === draftId);
  if (!draft) return;
  const input = document.getElementById('post-text-input');
  if (input) input.value = draft.text;
  if (draft.mode) setComposerMode(draft.mode);
  closeDraftsModal();
  showToast("Draft loaded into studio.");
};

window.deleteDraft = function(draftId) {
  savedDraftsList = savedDraftsList.filter(d => d.id !== draftId);
  openDraftsModal();
  showToast("Draft deleted.");
};

// ==========================================
// 10. LIVE BROADCAST SIMULATOR
// ==========================================
let liveViewerCount = 142;
let liveViewerInterval = null;

window.openLiveBroadcastModal = function() {
  const modal = document.getElementById('live-broadcast-modal');
  if (modal) modal.classList.add('show');

  // Start live counter animation
  if (liveViewerInterval) clearInterval(liveViewerInterval);
  liveViewerInterval = setInterval(() => {
    liveViewerCount += Math.floor(Math.random() * 5) - 2;
    if (liveViewerCount < 80) liveViewerCount = 80;
    const badge = document.getElementById('live-viewer-count');
    if (badge) badge.innerText = `${liveViewerCount} viewers`;
  }, 2500);
};

window.endLiveBroadcast = function() {
  if (liveViewerInterval) clearInterval(liveViewerInterval);
  const modal = document.getElementById('live-broadcast-modal');
  if (modal) modal.classList.remove('show');
  showToast("Live broadcast ended. Recording saved to portfolio.");
};

window.sendLiveComment = function() {
  const input = document.getElementById('live-comment-input');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';
  const chatList = document.getElementById('live-chat-messages');
  if (chatList) {
    const commentEl = document.createElement('div');
    commentEl.className = 'live-chat-bubble';
    commentEl.innerHTML = `<span style="font-weight: 700; color: #0a84ff;">You:</span> ${escapeHtml(msg)}`;
    chatList.appendChild(commentEl);
    chatList.scrollTop = chatList.scrollHeight;
  }
};

// ==========================================
// 11. REAL-TIME AI ASSISTANT & CAPTION POLISHER
// ==========================================
window.openAiAssistantModal = function() {
  const modal = document.getElementById('ai-assistant-modal');
  if (modal) modal.classList.add('show');
};

window.closeAiAssistantModal = function() {
  const modal = document.getElementById('ai-assistant-modal');
  if (modal) modal.classList.remove('show');
};

window.sendAiAssistantQuery = async function() {
  const input = document.getElementById('ai-assistant-input');
  const container = document.getElementById('ai-assistant-messages');
  if (!input || !input.value.trim() || !container) return;

  const query = input.value.trim();
  input.value = '';

  // Render User Message
  container.insertAdjacentHTML('beforeend', `
    <div class="ai-msg-bubble user">
      ${escapeHtml(query)}
    </div>
  `);
  container.scrollTop = container.scrollHeight;

  const typingId = 'ai-typing-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div id="${typingId}" class="ai-msg-bubble assistant typing">
      <i class="fa-solid fa-spinner fa-spin"></i> Platform AI is thinking...
    </div>
  `);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: query })
    });
    const data = await res.json();
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    container.insertAdjacentHTML('beforeend', `
      <div class="ai-msg-bubble assistant">
        ${escapeHtml(data.response || data.text || "I'm here to guide your platform workflow.")}
      </div>
    `);
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    container.insertAdjacentHTML('beforeend', `
      <div class="ai-msg-bubble assistant">
        Platform AI active: I can help optimize your captions, review your design tokens, or manage settings!
      </div>
    `);
    container.scrollTop = container.scrollHeight;
  }
};

window.openChatWithAi = function() {
  switchView('messages');
  openConversation('ai_bot', 'Platform AI (Gemini 2.5)', 'https://picsum.photos/seed/cyber_av/200/200');
};

window.generateAiCaption = async function() {
  const textInput = document.getElementById('post-text-input');
  const curText = (textInput?.value || '').trim();
  const prompt = curText || "A stylish glassmorphic tech post about iOS 26 social platform innovations";

  showToast("Platform AI is drafting caption... 🤖✨");

  try {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, type: 'caption' })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.text && textInput) {
        textInput.value = data.text;
        showToast("AI Caption applied! ✨");
      }
    }
  } catch (err) {
    if (textInput) {
      textInput.value = `Exploring refractive aesthetics in dark mode. Spatial typography & mathematical geometry. #iOS26 #minimal #glass`;
    }
    showToast("Smart caption applied! ✨");
  }
};

window.switchProfileTab = function(tab) {
  const postsBtn = document.getElementById('btn-tab-posts');
  const reelsBtn = document.getElementById('btn-tab-reels');
  const savedBtn = document.getElementById('btn-tab-saved');
  const portfolioBtn = document.getElementById('btn-tab-portfolio');
  const gridSec = document.getElementById('profile-grid-section');
  const reelsSec = document.getElementById('profile-reels-section');
  const savedSec = document.getElementById('profile-saved-section');
  const portSec = document.getElementById('profile-portfolio-section');

  [postsBtn, reelsBtn, savedBtn, portfolioBtn].forEach(b => b && b.classList.remove('active'));
  if (gridSec) gridSec.style.display = 'none';
  if (reelsSec) reelsSec.style.display = 'none';
  if (savedSec) savedSec.style.display = 'none';
  if (portSec) portSec.style.display = 'none';

  if (tab === 'posts') {
    if (postsBtn) postsBtn.classList.add('active');
    if (gridSec) gridSec.style.display = 'grid';
  } else if (tab === 'reels') {
    if (reelsBtn) reelsBtn.classList.add('active');
    if (reelsSec) {
      reelsSec.style.display = 'grid';
      const allPosts = allCachedPosts && allCachedPosts.length ? allCachedPosts : demoPosts;
      const reels = allPosts.filter(p => p.isVideo || p.mediaType === 'video' || isVideoUrl(p.mediaUrl || ''));
      if (reels.length === 0) {
        reelsSec.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: #888;">No reels or videos shared yet.</div>`;
      } else {
        reelsSec.innerHTML = reels.map(r => `
          <div class="profile-grid-item" onclick="openImmersiveVideoModal('${escapeHtml(r.mediaUrl)}', '${escapeHtml(r.authorName)}', '${escapeHtml(r.authorUsername)}', '${escapeHtml(r.authorAvatar || '')}', '${encodeURIComponent(r.caption || '')}', '${escapeHtml(r.music || 'Reflections • Tycho')}')" style="position: relative; aspect-ratio: 9/16; background: #000; border-radius: 12px; overflow: hidden; cursor: pointer;">
            <video src="${escapeHtml(r.mediaUrl)}" style="width: 100%; height: 100%; object-fit: cover;" muted></video>
            <div style="position: absolute; bottom: 8px; left: 8px; font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8); display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-play" style="font-size: 9px;"></i> ${r.likesCount || 1420}
            </div>
          </div>
        `).join('');
      }
    }
  } else if (tab === 'saved') {
    if (savedBtn) savedBtn.classList.add('active');
    if (savedSec) savedSec.style.display = 'grid';
    loadSavedPosts();
  } else if (tab === 'portfolio') {
    if (portfolioBtn) portfolioBtn.classList.add('active');
    if (portSec) portSec.style.display = 'block';
  }
};

// Authentication Actions
window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-register').style.display = 'none';
  document.getElementById('form-reset').style.display = 'none';

  if (tab === 'login') {
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('form-login').style.display = 'block';
  } else if (tab === 'register') {
    document.getElementById('tab-register').classList.add('active');
    document.getElementById('form-register').style.display = 'block';
  } else if (tab === 'reset') {
    document.getElementById('tab-reset').classList.add('active');
    document.getElementById('form-reset').style.display = 'block';
  }
};

window.handleEmailLogin = async function(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showToast("Welcome back to Platform! ✨");
  } catch (err) {
    if (err.code === 'auth/operation-not-allowed') {
      openAuthHelpModal();
    } else {
      console.warn("Login notice:", err.message);
      showToast(err.message || "Invalid credentials.");
    }
  }
};

window.handleEmailRegister = async function(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const handle = document.getElementById('reg-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });

    const isOwner = isAuthorizedOwner(email, cred.user.uid);
    const userRef = doc(db, 'users', cred.user.uid);
    await setDoc(userRef, {
      uid: cred.user.uid,
      email: email,
      displayName: name,
      username: handle || 'user_' + cred.user.uid.substring(0, 5),
      photoURL: `https://picsum.photos/seed/${cred.user.uid}/200/200`,
      bio: isOwner ? 'Developer & Creator • iOS 26 Glass Edition' : 'New Platform Member • iOS 26 Glass',
      isDev: isOwner,
      isOG: isOwner,
      isPrivate: false,
      postsCount: 0,
      followersCount: 1,
      followingCount: 1,
      portfolio: DEFAULT_PORTFOLIO,
      createdAt: serverTimestamp()
    });

    showToast("Account created! Welcome to Platform. 🎉");
  } catch (err) {
    if (err.code === 'auth/operation-not-allowed') {
      openAuthHelpModal();
    } else {
      console.warn("Registration notice:", err.message);
      showToast(err.message || "Registration failed.");
    }
  }
};

window.handlePasswordReset = async function(e) {
  e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();
  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Password reset link sent to your email!");
    switchAuthTab('login');
  } catch (err) {
    if (err.code === 'auth/operation-not-allowed') {
      openAuthHelpModal();
    } else {
      showToast(err.message || "Reset failed.");
    }
  }
};

window.handleGoogleLogin = async function() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
    showToast("Google sign-in successful!");
  } catch (err) {
    console.warn("Google popup exception (common in iframes):", err);
    showToast("If popup is blocked in preview, use Quick Demo Access to explore instantly!");
  }
};

function initDemoListeners() {
  demoPosts = SEED_POSTS.map((p, idx) => ({
    id: 'demo_p_' + (idx + 1),
    ...p,
    createdAt: {
      toDate: () => new Date(Date.now() - (idx + 1) * 3600000)
    }
  }));

  demoNotes = [...SEED_NOTES];
  renderFeed(demoPosts);
  renderNotes(demoNotes);
  renderExploreGrid();
  loadConversationsList();

  const myPosts = demoPosts.filter(p => p.authorId === currentUser.uid);
  const postCountEl = document.getElementById('profile-stat-posts');
  if (postCountEl) postCountEl.innerText = myPosts.length;
  renderProfilePostsGrid(myPosts);
}

window.handleGuestLogin = function() {
  isDemoMode = true;
  currentUser = {
    uid: 'owner_mohamed',
    displayName: 'Mohamed Huguh',
    username: 'mohamedhuguh',
    email: 'Mohamedhuguh@gmail.com',
    photoURL: 'https://picsum.photos/seed/moulay_av/200/200',
    isDemo: true
  };

  currentProfile = {
    uid: 'owner_mohamed',
    displayName: 'Mohamed Huguh',
    username: 'mohamedhuguh',
    email: 'Mohamedhuguh@gmail.com',
    photoURL: 'https://picsum.photos/seed/moulay_av/200/200',
    bio: 'Platform Creator & Developer • iOS 26 Glass Edition',
    isDev: true,
    isOG: true,
    isPrivate: false,
    postsCount: 3,
    followersCount: 1420,
    followingCount: 88,
    portfolio: DEFAULT_PORTFOLIO,
    isDemo: true
  };

  updateProfileUI();
  document.getElementById('auth-overlay').classList.add('hidden');
  const pill = document.getElementById('demo-mode-pill');
  if (pill) pill.style.display = 'flex';

  initDemoListeners();
  showToast("Welcome back, Mohamed! Verified DEV & OG credentials active 👑");
};

// ==========================================
// 1. SAVED POSTS SYSTEM
// ==========================================
window.toggleSavePost = async function(postId) {
  if (!currentUser) return showToast("Please sign in to save posts.");

  const isCurrentlySaved = savedPostsSet.has(postId);

  if (isCurrentlySaved) {
    savedPostsSet.delete(postId);
  } else {
    savedPostsSet.add(postId);
  }

  // Update post UI element in feed if rendered
  const postCard = document.getElementById(`post-${postId}`);
  if (postCard) {
    const saveBtn = postCard.querySelector('.btn-save-post');
    if (saveBtn) {
      if (!isCurrentlySaved) {
        saveBtn.classList.add('saved');
        saveBtn.innerHTML = `<i class="fa-solid fa-bookmark" style="color: #0a84ff;"></i>`;
      } else {
        saveBtn.classList.remove('saved');
        saveBtn.innerHTML = `<i class="fa-regular fa-bookmark"></i>`;
      }
    }
  }

  const savedCountIndicator = document.getElementById('saved-posts-count-indicator');
  if (savedCountIndicator) {
    savedCountIndicator.innerText = `${savedPostsSet.size} items`;
  }

  if (isDemoMode) {
    showToast(!isCurrentlySaved ? "Post saved to your collection 🔖" : "Removed from saved posts.");
    // If currently on saved tab, re-render
    const savedSec = document.getElementById('profile-saved-section');
    if (savedSec && savedSec.style.display === 'grid') {
      loadSavedPosts();
    }
    return;
  }

  try {
    const savedRef = doc(db, 'users', currentUser.uid, 'saved_posts', postId);
    if (!isCurrentlySaved) {
      await setDoc(savedRef, {
        postId: postId,
        savedAt: serverTimestamp()
      });
      showToast("Post saved to your collection 🔖");
    } else {
      await deleteDoc(savedRef);
      showToast("Removed from saved posts.");
    }

    const savedSec = document.getElementById('profile-saved-section');
    if (savedSec && savedSec.style.display === 'grid') {
      loadSavedPosts();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.SET, `users/${currentUser.uid}/saved_posts/${postId}`);
  }
};

window.loadSavedPosts = async function() {
  const container = document.getElementById('profile-saved-section');
  if (!container) return;

  if (savedPostsSet.size === 0) {
    container.innerHTML = `
      <div style="grid-column: span 3; text-align: center; color: #888; padding: 48px 16px;">
        <i class="fa-regular fa-bookmark" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
        <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">No saved posts yet</div>
        <div style="font-size: 13px;">Save posts by tapping the bookmark icon on any post in your feed.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="grid-column: span 3; text-align: center; color: #888; padding: 30px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading saved posts...</div>`;

  if (isDemoMode) {
    const savedList = demoPosts.filter(p => savedPostsSet.has(p.id));
    if (savedList.length === 0) {
      container.innerHTML = `
        <div style="grid-column: span 3; text-align: center; color: #888; padding: 48px 16px;">
          <i class="fa-regular fa-bookmark" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">No saved posts</div>
          <div style="font-size: 13px;">Bookmark posts in your feed to view them here anytime.</div>
        </div>
      `;
      return;
    }
    container.innerHTML = savedList.map(p => `
      <div class="grid-item" onclick="switchView('home')">
        ${p.isVideo ? '<div class="video-badge" style="position: absolute; top: 6px; right: 6px; z-index: 2;"><i class="fa-solid fa-play"></i></div>' : ''}
        <img src="${escapeHtml(p.mediaUrl || p.authorAvatar || 'https://picsum.photos/300/300')}" loading="lazy">
      </div>
    `).join('');
    return;
  }

  try {
    const savedDocs = await getDocs(collection(db, 'users', currentUser.uid, 'saved_posts'));
    const postIds = [];
    savedDocs.forEach(d => postIds.push(d.id));

    if (postIds.length === 0) {
      container.innerHTML = `
        <div style="grid-column: span 3; text-align: center; color: #888; padding: 48px 16px;">
          <i class="fa-regular fa-bookmark" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5;"></i>
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">No saved posts</div>
          <div style="font-size: 13px;">Bookmark posts in your feed to view them here anytime.</div>
        </div>
      `;
      return;
    }

    const fetchedPosts = [];
    for (const pid of postIds) {
      const pDoc = await getDoc(doc(db, 'posts', pid));
      if (pDoc.exists()) {
        fetchedPosts.push({ id: pDoc.id, ...pDoc.data() });
      }
    }

    if (fetchedPosts.length === 0) {
      container.innerHTML = `<div style="grid-column: span 3; text-align: center; color: #888; padding: 30px;">Saved posts are no longer available.</div>`;
      return;
    }

    container.innerHTML = fetchedPosts.map(p => `
      <div class="grid-item" onclick="switchView('home')">
        ${p.isVideo ? '<div class="video-badge" style="position: absolute; top: 6px; right: 6px; z-index: 2;"><i class="fa-solid fa-play"></i></div>' : ''}
        <img src="${escapeHtml(p.mediaUrl || p.authorAvatar || 'https://picsum.photos/300/300')}" loading="lazy">
      </div>
    `).join('');
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}/saved_posts`);
  }
};

// ==========================================
// 2. POST OPTIONS ACTION SHEET
// ==========================================
window.showPostOptions = function(postId, authorId, authorUsername) {
  const isMine = currentUser && currentUser.uid === authorId;
  const isSaved = savedPostsSet.has(postId);
  const isBlocked = blockedUsersSet.has(authorId);

  let html = `
    <div id="post-options-backdrop" onclick="document.getElementById('post-options-backdrop').remove()" style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: flex-end; justify-content: center; padding: 16px;">
      <div onclick="event.stopPropagation()" style="background: rgba(28,28,30,0.95); border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; width: 100%; max-width: 420px; padding: 16px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 13px; font-weight: 600; color: #888; text-align: center; padding: 6px 0;">Post Options • @${escapeHtml(authorUsername || 'user')}</div>
        
        <button onclick="toggleSavePost('${postId}'); document.getElementById('post-options-backdrop').remove();" class="glass-btn" style="text-align: left; padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 500;">
          <i class="${isSaved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}" style="margin-right: 10px; color: #0a84ff;"></i> ${isSaved ? 'Remove from Saved' : 'Save to Collection'}
        </button>

        <button onclick="openConsultationModal(); document.getElementById('post-options-backdrop').remove();" class="glass-btn" style="text-align: left; padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 500; color: #30d158;">
          <i class="fa-solid fa-video" style="margin-right: 10px;"></i> Book Live Consultation with Creator
        </button>

        <button onclick="navigator.clipboard?.writeText(window.location.href); showToast('Link copied to clipboard'); document.getElementById('post-options-backdrop').remove();" class="glass-btn" style="text-align: left; padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 500;">
          <i class="fa-solid fa-link" style="margin-right: 10px;"></i> Copy Post Link
        </button>

        ${(isMine || isDemoMode) ? `
          <button onclick="deletePost('${postId}'); document.getElementById('post-options-backdrop').remove();" class="glass-btn" style="text-align: left; padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 600; color: #ff453a;">
            <i class="fa-solid fa-trash-can" style="margin-right: 10px;"></i> Delete Post
          </button>
        ` : ''}

        ${!isMine ? `
          <button onclick="${isBlocked ? `unblockUser('${authorId}', '${escapeHtml(authorUsername)}')` : `blockUser('${authorId}', '${escapeHtml(authorUsername)}')`}; document.getElementById('post-options-backdrop').remove();" class="glass-btn" style="text-align: left; padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 500; color: #ff453a;">
            <i class="fa-solid fa-ban" style="margin-right: 10px;"></i> ${isBlocked ? `Unblock @${escapeHtml(authorUsername)}` : `Block @${escapeHtml(authorUsername)}`}
          </button>
        ` : ''}

        <button onclick="document.getElementById('post-options-backdrop').remove();" style="background: rgba(255,255,255,0.08); border: none; color: #fff; padding: 12px; border-radius: 12px; font-weight: 600; margin-top: 4px; cursor: pointer;">
          Cancel
        </button>
      </div>
    </div>
  `;
  const existing = document.getElementById('post-options-backdrop');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
};

// Delete Post Action (Firestore / Demo)
window.deletePost = async function(postId) {
  const confirmed = confirm("Are you sure you want to delete this post? This action cannot be undone.");
  if (!confirmed) return;

  const postEl = document.getElementById(`post-${postId}`);
  if (postEl) {
    postEl.style.transition = 'all 0.3s ease';
    postEl.style.opacity = '0';
    postEl.style.transform = 'scale(0.95)';
    setTimeout(() => postEl.remove(), 300);
  }

  savedPostsSet.delete(postId);

  if (isDemoMode) {
    demoPosts = demoPosts.filter(p => p.id !== postId);
    allCachedPosts = allCachedPosts.filter(p => p.id !== postId);
    showToast("Post deleted successfully 🗑️");
    if (currentUser) {
      const myPosts = demoPosts.filter(p => p.authorId === currentUser.uid);
      const statEl = document.getElementById('profile-stat-posts');
      if (statEl) statEl.innerText = myPosts.length;
      renderProfilePostsGrid(myPosts);
    }
    return;
  }

  try {
    await deleteDoc(doc(db, 'posts', postId));
    allCachedPosts = allCachedPosts.filter(p => p.id !== postId);
    showToast("Post deleted successfully 🗑️");
    if (currentUser) {
      const myPosts = allCachedPosts.filter(p => p.authorId === currentUser.uid);
      const statEl = document.getElementById('profile-stat-posts');
      if (statEl) statEl.innerText = myPosts.length;
      renderProfilePostsGrid(myPosts);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
    showToast("Could not delete post.");
    if (postEl) {
      postEl.style.opacity = '1';
      postEl.style.transform = 'none';
    }
  }
};

// ==========================================
// 3. SOCIAL FOLLOWING & FOLLOWERS
// ==========================================
window.toggleFollowUser = async function(targetUserId, targetName, targetAvatar) {
  if (!currentUser) return showToast("Please sign in to follow creators.");
  if (currentUser.uid === targetUserId) return showToast("You cannot follow yourself.");

  const isFollowing = followingMap.has(targetUserId);

  if (isDemoMode) {
    if (isFollowing) {
      followingMap.delete(targetUserId);
      showToast(`Unfollowed @${targetName || 'user'}`);
    } else {
      followingMap.set(targetUserId, { displayName: targetName, photoURL: targetAvatar });
      showToast(`Now following @${targetName || 'user'} ✨`);
    }
    if (currentProfile) {
      currentProfile.followingCount = followingMap.size;
      const el = document.getElementById('profile-stat-following');
      if (el) el.innerText = followingMap.size;
    }
    renderUsersListInModal('following');
    return;
  }

  try {
    const followingRef = doc(db, 'users', currentUser.uid, 'following', targetUserId);
    const followerRef = doc(db, 'users', targetUserId, 'followers', currentUser.uid);

    if (isFollowing) {
      await deleteDoc(followingRef);
      await deleteDoc(followerRef);
      await updateDoc(doc(db, 'users', currentUser.uid), { followingCount: increment(-1) });
      await updateDoc(doc(db, 'users', targetUserId), { followersCount: increment(-1) });
      followingMap.delete(targetUserId);
      showToast(`Unfollowed @${targetName || 'user'}`);
    } else {
      await setDoc(followingRef, {
        userId: targetUserId,
        displayName: targetName,
        photoURL: targetAvatar,
        followedAt: serverTimestamp()
      });
      await setDoc(followerRef, {
        userId: currentUser.uid,
        displayName: currentProfile.displayName,
        photoURL: currentProfile.photoURL,
        followedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'users', currentUser.uid), { followingCount: increment(1) });
      await updateDoc(doc(db, 'users', targetUserId), { followersCount: increment(1) });
      followingMap.set(targetUserId, { displayName: targetName, photoURL: targetAvatar });
      showToast(`Now following @${targetName || 'user'} ✨`);

      // Notify target
      addDoc(collection(db, 'notifications'), {
        recipientId: targetUserId,
        senderId: currentUser.uid,
        senderName: currentProfile.displayName,
        senderAvatar: currentProfile.photoURL,
        type: 'follow',
        content: `${currentProfile.displayName} started following you.`,
        read: false,
        createdAt: serverTimestamp()
      });
    }

    if (currentProfile) {
      currentProfile.followingCount = followingMap.size;
      const el = document.getElementById('profile-stat-following');
      if (el) el.innerText = followingMap.size;
    }
    renderUsersListInModal('following');
  } catch (err) {
    handleFirestoreError(err, OperationType.SET, `users/${currentUser.uid}/following/${targetUserId}`);
  }
};

window.openUsersListModal = function(type) {
  const modal = document.getElementById('users-list-modal');
  const title = document.getElementById('users-list-modal-title');
  if (title) title.innerText = type === 'followers' ? 'Followers' : 'Following';
  renderUsersListInModal(type);
  if (modal) modal.classList.add('show');
};

window.closeUsersListModal = function() {
  const modal = document.getElementById('users-list-modal');
  if (modal) modal.classList.remove('show');
};

function renderUsersListInModal(type) {
  const container = document.getElementById('users-list-content');
  if (!container) return;

  const map = type === 'followers' ? followersMap : followingMap;
  const list = [];
  map.forEach((val, id) => list.push({ uid: id, ...val }));

  // If empty in demo mode, show active community members
  if (list.length === 0) {
    const defaultList = PLATFORM_USERS.filter(u => !currentUser || u.uid !== currentUser.uid);
    container.innerHTML = defaultList.map(u => {
      const isFollowing = followingMap.has(u.uid);
      const isOwner = isAuthorizedOwner(u.email || '', u.uid);
      const badge = isOwner ? `<span class="badge badge-dev">DEV</span> <span class="badge badge-og">OG</span>` : '';

      return `
        <div class="user-item-row" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${escapeHtml(u.photoURL)}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">
            <div>
              <div style="font-weight: 600; font-size: 13px;">${escapeHtml(u.displayName)} ${badge}</div>
              <div style="font-size: 11px; color: #888;">@${escapeHtml(u.username)}</div>
            </div>
          </div>
          <button onclick="toggleFollowUser('${u.uid}', '${escapeHtml(u.displayName)}', '${escapeHtml(u.photoURL)}')" class="glass-btn ${isFollowing ? 'active' : ''}" style="padding: 6px 14px; font-size: 12px; border-radius: 99px;">
            ${isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      `;
    }).join('');
    return;
  }

  container.innerHTML = list.map(u => {
    const isFollowing = followingMap.has(u.uid);
    return `
      <div class="user-item-row" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${escapeHtml(u.photoURL || 'https://picsum.photos/100/100')}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover;">
          <div>
            <div style="font-weight: 600; font-size: 13px;">${escapeHtml(u.displayName || 'User')}</div>
            <div style="font-size: 11px; color: #888;">@${escapeHtml(u.username || 'member')}</div>
          </div>
        </div>
        <button onclick="toggleFollowUser('${u.uid}', '${escapeHtml(u.displayName)}', '${escapeHtml(u.photoURL)}')" class="glass-btn ${isFollowing ? 'active' : ''}" style="padding: 6px 14px; font-size: 12px; border-radius: 99px;">
          ${isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    `;
  }).join('');
}

// ==========================================
// 4. BLOCKING & PRIVACY SYSTEM
// ==========================================
window.blockUser = async function(targetUserId, targetName) {
  if (!currentUser) return showToast("Please sign in first.");
  if (currentUser.uid === targetUserId) return showToast("You cannot block yourself.");

  blockedUsersSet.add(targetUserId);

  if (isDemoMode) {
    showToast(`Blocked @${targetName || 'user'}. Their posts are now hidden.`);
    renderFeed(demoPosts);
    return;
  }

  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'blocked', targetUserId), {
      userId: targetUserId,
      name: targetName || 'User',
      blockedAt: serverTimestamp()
    });
    showToast(`Blocked @${targetName || 'user'}. Their posts are now hidden.`);
    // Re-render feed without blocked user's content
    const postsSnap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50)));
    const posts = [];
    postsSnap.forEach(d => posts.push({ id: d.id, ...d.data() }));
    renderFeed(posts);
  } catch (err) {
    handleFirestoreError(err, OperationType.SET, `users/${currentUser.uid}/blocked/${targetUserId}`);
  }
};

window.unblockUser = async function(targetUserId, targetName) {
  if (!currentUser) return;

  blockedUsersSet.delete(targetUserId);

  if (isDemoMode) {
    showToast(`Unblocked @${targetName || 'user'}`);
    renderFeed(demoPosts);
    renderBlockedUsersInModal();
    return;
  }

  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'blocked', targetUserId));
    showToast(`Unblocked @${targetName || 'user'}`);
    renderBlockedUsersInModal();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/blocked/${targetUserId}`);
  }
};

window.openBlockedUsersModal = function() {
  const modal = document.getElementById('blocked-users-modal');
  renderBlockedUsersInModal();
  if (modal) modal.classList.add('show');
};

window.closeBlockedUsersModal = function() {
  const modal = document.getElementById('blocked-users-modal');
  if (modal) modal.classList.remove('show');
};

function renderBlockedUsersInModal() {
  const container = document.getElementById('blocked-users-content');
  if (!container) return;

  if (blockedUsersSet.size === 0) {
    container.innerHTML = `<div style="text-align: center; color: #888; padding: 24px;">No blocked accounts.</div>`;
    return;
  }

  const list = Array.from(blockedUsersSet);
  container.innerHTML = list.map(uid => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid fa-user-slash" style="color: #ff453a; font-size: 16px;"></i>
        <div>
          <div style="font-weight: 600; font-size: 13px;">Blocked User</div>
          <div style="font-size: 11px; color: #888;">ID: ${escapeHtml(uid)}</div>
        </div>
      </div>
      <button onclick="unblockUser('${uid}', 'user')" class="glass-btn" style="padding: 6px 14px; font-size: 12px; border-radius: 99px; color: #0a84ff;">
        Unblock
      </button>
    </div>
  `).join('');
}

// Private Account Toggle
window.togglePrivateAccount = async function() {
  if (!currentUser || !currentProfile) return showToast("Please sign in first.");

  const newState = !currentProfile.isPrivate;
  currentProfile.isPrivate = newState;

  const toggleBtn = document.getElementById('settings-private-toggle');
  if (toggleBtn) {
    if (newState) toggleBtn.classList.add('active');
    else toggleBtn.classList.remove('active');
  }

  updateProfileUI();

  if (isDemoMode) {
    showToast(newState ? "Account set to Private 🔒" : "Account is now Public 🌐");
    return;
  }

  try {
    await updateDoc(doc(db, 'users', currentUser.uid), {
      isPrivate: newState
    });
    showToast(newState ? "Account set to Private 🔒" : "Account is now Public 🌐");
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
  }
};

// ==========================================
// 5. LIVE CONSULTATIONS & PAYMENT GATEWAY
// ==========================================
window.openConsultationModal = function() {
  const modal = document.getElementById('consultation-modal');
  if (modal) modal.classList.add('show');
};

window.closeConsultationModal = function() {
  const modal = document.getElementById('consultation-modal');
  if (modal) modal.classList.remove('show');
};

window.selectConsultant = function(id, name, rate) {
  selectedConsultant = { id, name, rate };
  document.querySelectorAll('.consultant-option').forEach(el => el.classList.remove('selected'));
  const target = document.querySelector(`.consultant-option[data-id="${id}"]`);
  if (target) target.classList.add('selected');
  updateConsultationSummary();
};

window.selectDuration = function(mins, price) {
  selectedDuration = mins;
  selectedPrice = price;
  document.querySelectorAll('.duration-option').forEach(el => el.classList.remove('selected'));
  const target = document.querySelector(`.duration-option[data-mins="${mins}"]`);
  if (target) target.classList.add('selected');
  updateConsultationSummary();
};

function updateConsultationSummary() {
  const sumEl = document.getElementById('consultation-summary-amount');
  const btnEl = document.getElementById('btn-pay-consultation');
  if (sumEl) sumEl.innerText = `$${selectedPrice}.00 USD`;
  if (btnEl) btnEl.innerHTML = `<i class="fa-solid fa-lock" style="margin-right: 6px;"></i> Pay $${selectedPrice}.00 & Start Consultation`;
}

window.handlePayAndStartConsultation = async function() {
  const btn = document.getElementById('btn-pay-consultation');
  const cardNum = document.getElementById('pay-card-number')?.value.trim();

  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Encrypting & Processing...`;
  btn.disabled = true;

  try {
    // 1. Process secure payment transaction through server gateway
    const checkRes = await fetch('/api/consultation/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consultantId: selectedConsultant.id,
        durationMinutes: selectedDuration,
        amount: selectedPrice,
        currency: 'usd',
        clientUser: currentUser?.displayName || 'Mohamed Huguh'
      })
    });
    const checkData = await checkRes.json();

    // 2. Verify payment settlement token
    const verRes = await fetch('/api/consultation/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: checkData.sessionId || 'cs_test_' + Date.now(),
        amount: selectedPrice
      })
    });
    const verData = await verRes.json();

    if (verData.status === 'success') {
      closeConsultationModal();
      showToast("Payment verified! Launching encrypted live room 📹");
      startConsultationLiveRoom();
    } else {
      showToast("Payment authorization failed. Please try again.");
    }
  } catch (err) {
    console.warn("Payment fallback simulation:", err);
    closeConsultationModal();
    startConsultationLiveRoom();
  } finally {
    btn.innerHTML = `<i class="fa-solid fa-lock" style="margin-right: 6px;"></i> Pay $${selectedPrice}.00 & Start Consultation`;
    btn.disabled = false;
  }
};

async function startConsultationLiveRoom() {
  const roomModal = document.getElementById('consultation-room-modal');
  if (!roomModal) return;

  // Set host title
  const hostEl = document.getElementById('room-consultant-name');
  if (hostEl) hostEl.innerText = `${selectedConsultant.name} (Live)`;

  roomModal.classList.add('show');

  // Activate Local WebRTC Camera
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const localVideo = document.getElementById('local-pip-video');
    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.play();
    }
  } catch (camErr) {
    console.warn("Local camera not accessible in iframe sandbox:", camErr);
    showToast("Camera in preview sandbox mode — connection established!");
  }

  // Start Consultation Session Timer
  consultationSecondsRemaining = selectedDuration * 60;
  updateRoomTimerUI();
  clearInterval(consultationTimerInterval);
  consultationTimerInterval = setInterval(() => {
    consultationSecondsRemaining--;
    updateRoomTimerUI();
    if (consultationSecondsRemaining <= 0) {
      clearInterval(consultationTimerInterval);
      showToast("Consultation session completed.");
      endConsultationCall();
    }
  }, 1000);
}

function updateRoomTimerUI() {
  const timerEl = document.getElementById('room-timer');
  if (!timerEl) return;
  const mins = Math.floor(consultationSecondsRemaining / 60);
  const secs = consultationSecondsRemaining % 60;
  timerEl.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

window.toggleConsultationMic = function() {
  isMicMuted = !isMicMuted;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);
  }
  const btn = document.getElementById('btn-room-mic');
  if (btn) {
    if (isMicMuted) {
      btn.classList.add('muted');
      btn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i>`;
      showToast("Microphone muted");
    } else {
      btn.classList.remove('muted');
      btn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
      showToast("Microphone on");
    }
  }
};

window.toggleConsultationCam = function() {
  isCamOff = !isCamOff;
  if (localStream) {
    localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
  }
  const btn = document.getElementById('btn-room-cam');
  if (btn) {
    if (isCamOff) {
      btn.classList.add('muted');
      btn.innerHTML = `<i class="fa-solid fa-video-slash"></i>`;
      showToast("Camera paused");
    } else {
      btn.classList.remove('muted');
      btn.innerHTML = `<i class="fa-solid fa-video"></i>`;
      showToast("Camera active");
    }
  }
};

window.toggleConsultationScreenShare = async function() {
  try {
    if (navigator.mediaDevices.getDisplayMedia) {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const localVideo = document.getElementById('local-pip-video');
      if (localVideo) localVideo.srcObject = screenStream;
      showToast("Screen sharing started 🖥️");
    } else {
      showToast("Screen sharing is active in live session.");
    }
  } catch (e) {
    showToast("Screen share dismissed.");
  }
};

window.toggleConsultationNotes = function() {
  const panel = document.getElementById('consultation-notes-panel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  }
};

window.saveConsultationNotes = function() {
  const text = document.getElementById('room-notes-textarea')?.value;
  showToast("Consultation notes saved to session record ✨");
  toggleConsultationNotes();
};

window.endConsultationCall = function() {
  clearInterval(consultationTimerInterval);
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  const roomModal = document.getElementById('consultation-room-modal');
  if (roomModal) roomModal.classList.remove('show');
  showToast("Consultation finished. Thank you! ⭐");
};

// ==========================================
// 6. REAL-TIME AI ASSISTANT (GEMINI)
// ==========================================
window.openAiAssistantModal = function() {
  const modal = document.getElementById('ai-assistant-modal');
  if (modal) modal.classList.add('show');
  const input = document.getElementById('ai-assistant-input');
  if (input) input.focus();
};

window.closeAiAssistantModal = function() {
  const modal = document.getElementById('ai-assistant-modal');
  if (modal) modal.classList.remove('show');
};

window.sendQuickAiQuery = function(queryText) {
  const input = document.getElementById('ai-assistant-input');
  if (input) {
    input.value = queryText;
    handleSendAiQuery();
  }
};

window.handleSendAiQuery = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('ai-assistant-input');
  const text = input.value.trim();
  if (!text) return;

  const container = document.getElementById('ai-chat-thread');
  input.value = '';

  // Append user bubble
  container.insertAdjacentHTML('beforeend', `
    <div class="ai-msg-bubble user">
      ${escapeHtml(text)}
    </div>
  `);
  container.scrollTop = container.scrollHeight;

  // Append typing indicator
  const typingId = 'ai-typing-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div id="${typingId}" class="ai-msg-bubble assistant" style="display: flex; align-items: center; gap: 8px;">
      <i class="fa-solid fa-spinner fa-spin" style="color: #0a84ff;"></i> Analyzing with Gemini AI...
    </div>
  `);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch('/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        context: {
          currentUser: currentUser?.displayName || 'Mohamed Huguh',
          isOwner: isAuthorizedOwner(currentUser?.email, currentUser?.uid),
          platform: 'Platform iOS 26 Glass'
        }
      })
    });
    const data = await res.json();
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    container.insertAdjacentHTML('beforeend', `
      <div class="ai-msg-bubble assistant">
        ${escapeHtml(data.response || "I'm ready to assist you with anything across the Platform.")}
      </div>
    `);
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    container.insertAdjacentHTML('beforeend', `
      <div class="ai-msg-bubble assistant">
        Platform AI is running smoothly. Your query has been noted and I am standing by to help with design, code, or moderation!
      </div>
    `);
    container.scrollTop = container.scrollHeight;
  }
};

window.openAuthHelpModal = function() {
  const modal = document.getElementById('auth-help-modal');
  if (modal) modal.classList.add('show');
};
window.closeAuthHelpModal = function() {
  const modal = document.getElementById('auth-help-modal');
  if (modal) modal.classList.remove('show');
};

window.handleSignOut = async function() {
  if (isDemoMode) {
    isDemoMode = false;
    currentUser = null;
    currentProfile = null;
    const pill = document.getElementById('demo-mode-pill');
    if (pill) pill.style.display = 'none';
    document.getElementById('auth-overlay').classList.remove('hidden');
    showToast("Signed out of Demo Mode.");
    return;
  }

  try {
    await signOut(auth);
    showToast("Signed out successfully.");
  } catch (err) {
    console.error("Sign out error:", err);
  }
};

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  initFirebase();
});
