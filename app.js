/*
 * Forage Parcel Camera App Javascript Logic (조사료 필지 카메라 앱 로직)
 */

// Global error handler to catch and display mobile JS issues
window.onerror = function(message, source, lineno, colno, error) {
  const display = document.getElementById('gps-detail-display');
  if (display) {
    const file = source ? source.split('/').pop() : 'unknown';
    display.innerHTML += `<div style="color: var(--gps-poor); font-weight: bold; font-size: 0.75rem; margin-top: 0.5rem; word-break: break-all; text-align: left; border-top: 1px dashed var(--gps-poor); padding-top: 0.4rem;">[런타임 오류] ${message} (${file}:${lineno}:${colno})</div>`;
  }
  return false;
};

// IndexedDB Helper Functions for Local Album Storage
const DB_NAME = 'ForageCameraDB';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function savePhotoToDB(db, photoData) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(photoData);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function getAllPhotosFromDB(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function deletePhotoFromDB(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

// Application State
const state = {
  image: null,
  latitude: null,
  longitude: null,
  accuracy: null,
  address: '',
  roadAddress: '',
  crop: '이탈리안 라이그라스 (IRG)',
  baleCount: '',
  inspector: '',
  memo: '',
  watermarkStyle: 'minimal',
  kakaoKey: localStorage.getItem('kakao_app_key') || '',
  geocoder: null,
  map: null,
  gpsTimer: null,
  sdkInitFailed: false,
  db: null,
  currentZoomPhoto: null
};

// UI Elements
const imageInput = document.getElementById('image-input');
const previewBox = document.getElementById('preview-box');
const placeholderView = document.getElementById('placeholder-view');
const canvas = document.getElementById('watermark-canvas');
const ctx = canvas.getContext('2d');

const gpsBadge = document.getElementById('gps-status-badge');
const gpsStatusText = document.getElementById('gps-status-text');
const gpsCoordinates = document.getElementById('gps-coordinates');
const gpsDetailDisplay = document.getElementById('gps-detail-display');
const minimap = document.getElementById('kakao-minimap');

const parcelAddressInput = document.getElementById('parcel-address');
const roadAddressInput = document.getElementById('road-address');
const cropSelect = document.getElementById('crop-select');
const customCropGroup = document.getElementById('custom-crop-group');
const customCropInput = document.getElementById('custom-crop');
const inspectorNameInput = document.getElementById('inspector-name');
const parcelMemoInput = document.getElementById('parcel-memo');
const baleCountInput = document.getElementById('bale-count');

const snapBtn = document.getElementById('snap-btn');
const gpsBtn = document.getElementById('gps-btn');
const downloadBtn = document.getElementById('download-btn');

const settingsBtn = document.getElementById('open-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const kakaoKeyInput = document.getElementById('kakao-key');
const saveSettingsBtn = document.getElementById('save-settings');

// Download Fallback Modal UI Elements
const downloadModal = document.getElementById('download-modal');
const closeDownloadBtn = document.getElementById('close-download');
const resultImage = document.getElementById('result-image');
const directDownloadBtn = document.getElementById('direct-download-btn');
const closeDownloadBtn2 = document.getElementById('close-download-btn');

const toast = document.getElementById('toast-message');

// Capture Input Modal UI Elements (촬영 후 즉시 입력 팝업)
const captureModal = document.getElementById('capture-modal');
const closeCaptureModalBtn = document.getElementById('close-capture-modal');
const modalParcelAddress = document.getElementById('modal-parcel-address');
const modalRoadAddress = document.getElementById('modal-road-address');
const modalCropSelect = document.getElementById('modal-crop-select');
const modalCustomCropGroup = document.getElementById('modal-custom-crop-group');
const modalCustomCropInput = document.getElementById('modal-custom-crop');
const modalBaleCountInput = document.getElementById('modal-bale-count');
const saveCaptureBtn = document.getElementById('save-capture-btn');

// Zoom View Modal UI Elements (앨범 상세 보기 모달)
const zoomModal = document.getElementById('zoom-modal');
const closeZoomModalBtn = document.getElementById('close-zoom-modal');
const zoomImage = document.getElementById('zoom-image');
const zoomMetadata = document.getElementById('zoom-metadata');
const zoomDownloadBtn = document.getElementById('zoom-download-btn');
const zoomDeleteBtn = document.getElementById('zoom-delete-btn');
const zoomCloseBtn = document.getElementById('zoom-close-btn');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  // Load saved configuration
  if (state.kakaoKey) {
    kakaoKeyInput.value = state.kakaoKey;
    loadKakaoMapsSdk();
  }
  
  // Initialize Database
  initDB()
    .then((db) => {
      state.db = db;
      loadAlbum();
    })
    .catch((err) => console.error('Database initialization failed:', err));
  
  // Start Geolocation watch
  startGpsTracking();
  
  // Set up event listeners
  setupEventListeners();
  
  // Initial draw
  drawWatermark();
});

// Event Listeners Configuration
function setupEventListeners() {
  // Photo snapping / uploading
  snapBtn.addEventListener('click', () => imageInput.click());
  previewBox.addEventListener('click', () => {
    if (!state.image) imageInput.click();
  });
  
  imageInput.addEventListener('change', handleImageUpload);
  
  // Geolocation trigger
  gpsBtn.addEventListener('click', () => {
    showToast('GPS 위치 정보를 갱신하는 중...');
    startGpsTracking();
  });
  
  // Form Inputs binding to state and triggering redraw
  parcelAddressInput.addEventListener('input', (e) => {
    state.address = e.target.value;
    drawWatermark();
  });
  
  roadAddressInput.addEventListener('input', (e) => {
    state.roadAddress = e.target.value;
    drawWatermark();
  });
  
  cropSelect.addEventListener('change', (e) => {
    if (e.target.value === '기타 (Others)') {
      customCropGroup.style.display = 'flex';
      state.crop = customCropInput.value || '기타';
    } else {
      customCropGroup.style.display = 'none';
      state.crop = e.target.value;
    }
    drawWatermark();
  });
  
  customCropInput.addEventListener('input', (e) => {
    state.crop = e.target.value || '기타';
    drawWatermark();
  });
  
  inspectorNameInput.addEventListener('input', (e) => {
    state.inspector = e.target.value;
    drawWatermark();
  });
  
  parcelMemoInput.addEventListener('input', (e) => {
    state.memo = e.target.value;
    drawWatermark();
  });
  
  baleCountInput.addEventListener('input', (e) => {
    state.baleCount = e.target.value;
    drawWatermark();
  });
  
  // Settings Modal controls
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('open');
  });
  
  const closeModal = () => settingsModal.classList.remove('open');
  closeSettingsBtn.addEventListener('click', closeModal);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeModal();
  });
  
  saveSettingsBtn.addEventListener('click', () => {
    const key = kakaoKeyInput.value.trim();
    localStorage.setItem('kakao_app_key', key);
    state.kakaoKey = key;
    closeModal();
    showToast('설정이 저장되었습니다. 페이지를 새로고침하여 적용합니다.');
    setTimeout(() => location.reload(), 1000);
  });
  
  // Image Download
  downloadBtn.addEventListener('click', openDownloadModal);
  
  // Download Modal controls
  const closeDownload = () => {
    downloadModal.classList.remove('open');
    resetPhotoState();
  };
  closeDownloadBtn.addEventListener('click', closeDownload);
  closeDownloadBtn2.addEventListener('click', closeDownload);
  downloadModal.addEventListener('click', (e) => {
    if (e.target === downloadModal) closeDownload();
  });
  
  directDownloadBtn.addEventListener('click', () => {
    closeDownload();
    downloadWatermarkedImage();
  });
  
  // Capture Modal event listeners
  closeCaptureModalBtn.addEventListener('click', () => {
    captureModal.classList.remove('open');
    resetPhotoState();
  });
  
  modalCropSelect.addEventListener('change', (e) => {
    if (e.target.value === '기타 (Others)') {
      modalCustomCropGroup.style.display = 'flex';
    } else {
      modalCustomCropGroup.style.display = 'none';
    }
  });
  
  saveCaptureBtn.addEventListener('click', () => {
    let cropVal = modalCropSelect.value;
    if (cropVal === '기타 (Others)') {
      cropVal = modalCustomCropInput.value.trim() || '기타';
    }
    const baleVal = modalBaleCountInput.value.trim();
    
    // Sync state
    state.crop = cropVal;
    state.baleCount = baleVal;
    
    // Sync main form UI elements
    cropSelect.value = modalCropSelect.value;
    if (modalCropSelect.value === '기타 (Others)') {
      customCropGroup.style.display = 'flex';
      customCropInput.value = modalCustomCropInput.value;
    } else {
      customCropGroup.style.display = 'none';
      customCropInput.value = '';
    }
    baleCountInput.value = baleVal;
    
    // Draw watermark
    drawWatermark();
    
    // Save to IndexedDB
    if (state.db) {
      const photoItem = {
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        address: state.address,
        roadAddress: state.roadAddress,
        crop: state.crop,
        baleCount: state.baleCount,
        date: getFormattedDateTime(),
        inspector: state.inspector,
        memo: state.memo,
        latitude: state.latitude,
        longitude: state.longitude
      };
      
      savePhotoToDB(state.db, photoItem)
        .then(() => {
          loadAlbum();
          showToast('인증 사진이 앨범에 저장되었습니다.');
        })
        .catch((err) => console.error("IndexedDB save failed: ", err));
    }
    
    // Close capture modal
    captureModal.classList.remove('open');
    
    // Download logic
    if (isKakaoTalkWebView()) {
      // 카카오톡 내 인앱 브라우저인 경우 길게 누르기 다운로드 창을 띄웁니다.
      openDownloadModal();
    } else {
      // 일반 브라우저인 경우 다운로드 팝업 없이 바로 파일 저장 후 캔버스를 초기화합니다.
      try {
        downloadWatermarkedImage();
      } catch (err) {
        console.error("Direct download failed, showing modal fallback: ", err);
        openDownloadModal();
        return;
      }
      resetPhotoState();
    }
  });
  
  // Zoom Modal event listeners
  const closeZoom = () => {
    zoomModal.classList.remove('open');
    state.currentZoomPhoto = null;
  };
  closeZoomModalBtn.addEventListener('click', closeZoom);
  zoomCloseBtn.addEventListener('click', closeZoom);
  zoomModal.addEventListener('click', (e) => {
    if (e.target === zoomModal) closeZoom();
  });
  
  zoomDownloadBtn.addEventListener('click', () => {
    if (!state.currentZoomPhoto) return;
    const photo = state.currentZoomPhoto;
    const dateStr = photo.date.slice(0, 10).replace(/-/g, '');
    const addrClean = (photo.address || '수동입력필지').replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim().substring(0, 20);
    const cropClean = photo.crop.replace(/[^a-zA-Z0-9가-힣]/g, '');
    const filename = `${dateStr}_${addrClean}_${cropClean}.jpg`;
    
    const link = document.createElement('a');
    link.href = photo.dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('사진이 다운로드 폴더에 저장되었습니다.');
  });
  
  zoomDeleteBtn.addEventListener('click', () => {
    if (!state.currentZoomPhoto) return;
    if (confirm('이 인증 사진을 앨범에서 삭제하시겠습니까?')) {
      deletePhotoFromDB(state.db, state.currentZoomPhoto.id)
        .then(() => {
          closeZoom();
          showToast('사진이 삭제되었습니다.');
          loadAlbum();
        })
        .catch((err) => console.error("Delete failed: ", err));
    }
  });
}

// GPS / Geolocation Tracking
function startGpsTracking() {
  if (state.gpsTimer) {
    navigator.geolocation.clearWatch(state.gpsTimer);
  }
  
  if (!navigator.geolocation) {
    updateGpsStatus('poor', '지원 안 됨');
    gpsDetailDisplay.textContent = '이 브라우저는 GPS 수신을 지원하지 않습니다.';
    return;
  }
  
  gpsStatusText.textContent = '수신 중...';
  gpsBadge.className = 'gps-badge warning active';
  
  // watchPosition dynamically monitors coords
  state.gpsTimer = navigator.geolocation.watchPosition(
    (position) => {
      state.latitude = position.coords.latitude;
      state.longitude = position.coords.longitude;
      state.accuracy = position.coords.accuracy;
      
      const latFixed = state.latitude.toFixed(6);
      const lngFixed = state.longitude.toFixed(6);
      const accFixed = state.accuracy.toFixed(1);
      
      gpsCoordinates.textContent = `위도: ${latFixed}, 경도: ${lngFixed}`;
      
      let badgeStyle = 'poor';
      let badgeText = '낮음';
      
      if (state.accuracy <= 15) {
        badgeStyle = 'good';
        badgeText = '정밀 (Good)';
      } else if (state.accuracy <= 40) {
        badgeStyle = 'warning';
        badgeText = '보통 (Warning)';
      } else {
        badgeStyle = 'poor';
        badgeText = '오차 큼 (Poor)';
      }
      
      gpsBadge.className = `gps-badge ${badgeStyle}`;
      gpsStatusText.textContent = badgeText;
      
      gpsDetailDisplay.textContent = `위도: ${state.latitude}, 경도: ${state.longitude} (오차 범위: ±${accFixed}m)`;
      
      // Auto-query address if Kakao API is initialized
      fetchAddressFromCoords(state.latitude, state.longitude);
      
      // Update mini map if available
      updateMinimap(state.latitude, state.longitude);
      
      // Redraw watermark to reflect new coords
      drawWatermark();
    },
    (error) => {
      let errorMsg = '알 수 없는 위치 오류';
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = '권한 거부됨';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMsg = '수집 불가';
      } else if (error.code === error.TIMEOUT) {
        errorMsg = '시간 초과';
      }
      updateGpsStatus('poor', errorMsg);
      gpsDetailDisplay.textContent = `위치 정보를 가져올 수 없습니다. 원인: ${error.message}`;
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function updateGpsStatus(style, text) {
  gpsBadge.className = `gps-badge ${style}`;
  gpsStatusText.textContent = text;
}

// Dynamically Load Kakao Maps Web SDK
function loadKakaoMapsSdk() {
  if (!state.kakaoKey) {
    gpsDetailDisplay.innerHTML = '<span style="color: var(--gps-warning); font-weight: bold;">[카카오 API] 설정(톱니바퀴)에서 JavaScript 키를 입력해 주세요.</span>';
    return;
  }
  
  if (window.kakao && window.kakao.maps) return;
  
  gpsDetailDisplay.innerHTML = '<span>카카오 맵 SDK 로드 중...</span>';
  
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${state.kakaoKey}&libraries=services&autoload=false`;
  
  let sdkLoaded = false;
  
  script.onload = () => {
    try {
      if (typeof kakao === 'undefined') {
        throw new Error('kakao 객체가 로드되지 않았습니다.');
      }
      kakao.maps.load(() => {
        try {
          if (!kakao.maps.services || !kakao.maps.services.Geocoder) {
            throw new Error('Geocoder 서비스가 포함되지 않았습니다.');
          }
          state.geocoder = new kakao.maps.services.Geocoder();
          sdkLoaded = true;
          console.log('Kakao maps SDK & Geocoder loaded successfully.');
          gpsDetailDisplay.innerHTML = '<span style="color: var(--gps-good); font-weight: bold;">카카오 맵 SDK 연결 성공</span>';
          
          if (state.latitude && state.longitude) {
            fetchAddressFromCoords(state.latitude, state.longitude);
            updateMinimap(state.latitude, state.longitude);
          }
        } catch (innerError) {
          console.error(innerError);
          state.sdkInitFailed = true;
          gpsDetailDisplay.innerHTML = `<span style="color: var(--gps-poor); font-weight: bold;">[API 초기화 오류] ${innerError.message}</span>`;
        }
      });
    } catch (outerError) {
      console.error(outerError);
      state.sdkInitFailed = true;
      gpsDetailDisplay.innerHTML = `<span style="color: var(--gps-poor); font-weight: bold;">[SDK 로드 오류] ${outerError.message}</span>`;
    }
  };
  
  script.onerror = () => {
    console.error('Failed to load Kakao Maps SDK.');
    state.sdkInitFailed = true;
    gpsDetailDisplay.innerHTML = '<span style="color: var(--gps-poor); font-weight: bold;">[API 오류] 카카오 SDK 로드 실패. 인터넷 연결 또는 키를 확인하세요.</span>';
  };
  
  document.head.appendChild(script);
  
  // 4초 후 SDK가 여전히 연동되지 않았으면 도메인 미등록 가이드를 출력합니다.
  setTimeout(() => {
    if (!sdkLoaded) {
      state.sdkInitFailed = true;
      const maskedKey = state.kakaoKey 
        ? `${state.kakaoKey.substring(0, 5)}...${state.kakaoKey.substring(state.kakaoKey.length - 4)}` 
        : '없음';
      gpsDetailDisplay.innerHTML = `
        <span style="color: var(--gps-poor); font-weight: bold;">[주소 변환 실패] 카카오 API 응답 대기 시간 초과</span><br>
        <small style="color: var(--text-dark); font-size: 0.8rem; display: block; margin-top: 0.3rem; line-height: 1.4;">
          앱 설정 키: <strong style="color: var(--primary-deep);">${maskedKey}</strong> (설정에서 변경 가능)<br>
          카카오 개발자센터의 <strong>[내 애플리케이션 &gt; 플랫폼 &gt; Web 사이트 도메인]</strong>에 아래 주소가 등록되어 있는지 확인해 주세요:<br>
          <strong style="color: var(--gps-poor); font-size: 0.85rem; word-break: break-all;">${window.location.origin}</strong>
        </small>
      `;
    }
  }, 4000);
}

// Convert Coordinates to Address
function fetchAddressFromCoords(lat, lng) {
  if (!state.geocoder) {
    const keyStatus = state.sdkInitFailed 
      ? `SDK 연결 오류 (허용 도메인 등록 확인: ${window.location.origin})` 
      : (state.kakaoKey ? '키는 입력됨, SDK 로드 대기' : '카카오 API 키 입력 필요 (우측 상단 톱니바퀴)');
    gpsDetailDisplay.innerHTML = `위치: ${lat.toFixed(6)}, ${lng.toFixed(6)}<br><span style="color: var(--gps-poor); font-weight: bold;">[주소 변환 불가] ${keyStatus}</span>`;
    return;
  }
  
  state.geocoder.coord2Address(lng, lat, (result, status) => {
    const accFixed = state.accuracy ? state.accuracy.toFixed(1) : '--';
    if (status === kakao.maps.services.Status.OK) {
      const addressObj = result[0];
      
      if (addressObj.address) {
        state.address = addressObj.address.address_name;
        parcelAddressInput.value = state.address;
        if (modalParcelAddress) {
          modalParcelAddress.textContent = state.address;
        }
      }
      
      if (addressObj.road_address) {
        state.roadAddress = addressObj.road_address.address_name;
        roadAddressInput.value = state.roadAddress;
        if (modalRoadAddress) {
          modalRoadAddress.textContent = state.roadAddress;
        }
      } else {
        state.roadAddress = '도로명 주소 없음';
        roadAddressInput.value = state.roadAddress;
        if (modalRoadAddress) {
          modalRoadAddress.textContent = '도로명 주소 없음';
        }
      }
      
      gpsDetailDisplay.innerHTML = `위치: ${lat.toFixed(6)}, ${lng.toFixed(6)} (오차: ±${accFixed}m)<br><span style="color: var(--gps-good); font-weight: bold;">[주소 조회 성공] ${state.address}</span>`;
      showToast('지번 주소를 조회했습니다.');
      drawWatermark();
    } else {
      let errorDesc = '알 수 없는 오류';
      if (status === kakao.maps.services.Status.ZERO_RESULT) {
        errorDesc = '검색 결과 없음 (좌표가 한국 영토 바깥이거나 GPS 오류)';
      } else if (status === kakao.maps.services.Status.ERROR) {
        errorDesc = '인증 오류 (API 키 무효 또는 허용 도메인 미등록)';
      }
      gpsDetailDisplay.innerHTML = `위치: ${lat.toFixed(6)}, ${lng.toFixed(6)} (오차: ±${accFixed}m)<br><span style="color: var(--gps-poor); font-weight: bold;">[주소 변환 실패] ${errorDesc}</span>`;
      console.error('Geocoding failed with status:', status);
    }
  });
}

// Update Mini Map
function updateMinimap(lat, lng) {
  if (!window.kakao || !window.kakao.maps) return;
  
  minimap.style.display = 'block';
  
  const container = minimap;
  const options = {
    center: new kakao.maps.LatLng(lat, lng),
    level: 3
  };
  
  if (!state.map) {
    state.map = new kakao.maps.Map(container, options);
    
    // Add Marker
    const markerPosition = new kakao.maps.LatLng(lat, lng);
    const marker = new kakao.maps.Marker({
      position: markerPosition
    });
    marker.setMap(state.map);
  } else {
    const moveLatLon = new kakao.maps.LatLng(lat, lng);
    state.map.setCenter(moveLatLon);
    
    // Clear and redraw marker is simplified since setCenter works.
  }
}

// Handle Image snap/upload
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      previewBox.classList.add('active');
      placeholderView.style.display = 'none';
      canvas.style.display = 'block';
      downloadBtn.removeAttribute('disabled');
      
      // Draw watermark once image is ready
      drawWatermark();
      
      // Pre-fill read-only address in capture modal
      modalParcelAddress.textContent = state.address || '주소 수신 대기 중...';
      modalRoadAddress.textContent = state.roadAddress || '';
      
      // Pre-fill crop and bale count from current state
      modalCropSelect.value = state.crop;
      if (state.crop !== '이탈리안 라이그라스 (IRG)' && state.crop !== '호밀 (Rye)' && state.crop !== '청보리 (Barley)' && state.crop !== '귀리 (Oats)' && state.crop !== '옥수수 (Corn)' && state.crop !== '수단그라스 (Sudangrass)' && state.crop !== '혼파 (Mixed Grasses)') {
        modalCropSelect.value = '기타 (Others)';
        modalCustomCropGroup.style.display = 'flex';
        modalCustomCropInput.value = state.crop;
      } else {
        modalCustomCropGroup.style.display = 'none';
        modalCustomCropInput.value = '';
      }
      modalBaleCountInput.value = state.baleCount;
      
      // Show input popup modal immediately!
      captureModal.classList.add('open');
      showToast('사진이 로드되었습니다. 정보를 입력해 주세요.');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Draw Watermark Overlay on Canvas
function drawWatermark() {
  if (!state.image) {
    // If no image, keep canvas hidden
    canvas.style.display = 'none';
    placeholderView.style.display = 'flex';
    previewBox.classList.remove('active');
    downloadBtn.setAttribute('disabled', 'true');
    return;
  }
  
  // Set canvas size to match the original image size for high resolution!
  const imgWidth = state.image.naturalWidth || state.image.width;
  const imgHeight = state.image.naturalHeight || state.image.height;
  canvas.width = imgWidth;
  canvas.height = imgHeight;
  
  // Clear context
  ctx.clearRect(0, 0, imgWidth, imgHeight);
  
  // Draw base image
  ctx.drawImage(state.image, 0, 0, imgWidth, imgHeight);
  
  // Define responsive scale factor based on width to prevent pixelated/tiny text!
  const scale = imgWidth / 1000;
  
  // Prepare metadata strings
  const addressStr = state.address ? `필지: ${state.address}` : '필지: [지번 주소 입력 필요]';
  const roadStr = state.roadAddress ? `도로명: ${state.roadAddress}` : '';
  const dateStr = `촬영시각: ${getFormattedDateTime()}`;
  
  const latStr = state.latitude ? state.latitude.toFixed(6) : '--';
  const lngStr = state.longitude ? state.longitude.toFixed(6) : '--';
  const accStr = state.accuracy ? `(±${state.accuracy.toFixed(1)}m)` : '';
  const gpsStr = `GPS: ${latStr}, ${lngStr} ${accStr}`;
  
  const cropStr = `작물명: ${state.crop}`;
  const countStr = state.baleCount ? `개수: ${state.baleCount}개` : '';
  const inspectorStr = state.inspector ? `조사관: ${state.inspector}` : '';
  const memoStr = state.memo ? `메모: ${state.memo}` : '';
  
  // Render styles
  // Render styles (미니멀 투명 스타일 고정)
  renderMinimal(imgWidth, imgHeight, scale, addressStr, roadStr, dateStr, gpsStr, cropStr, countStr, inspectorStr, memoStr);
}

// Render: Style 3 - Minimal Text with shadow directly on photo
function renderMinimal(width, height, scale, address, road, date, gps, crop, count, inspector, memo) {
  ctx.textBaseline = 'bottom';
  const padding = 30 * scale;
  let y = height - padding;
  const x = padding;
  
  // Custom text drawer with shadow outline to make it readable anywhere
  const drawShadowText = (text, posX, posY, font, color, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${font}px "Outfit", "Noto Sans KR"`;
    
    // Draw outline shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 4 * scale;
    ctx.strokeText(text, posX, posY);
    
    // Draw text body
    ctx.fillStyle = color;
    ctx.fillText(text, posX, posY);
  };
  
  // Draw bottom up
  if (memo) {
    drawShadowText(memo, x, y, 14 * scale, '#e9ecef');
    y -= 22 * scale;
  }
  
  if (inspector) {
    drawShadowText(inspector, x, y, 15 * scale, '#52b788', true);
    y -= 22 * scale;
  }
  
  drawShadowText(gps, x, y, 13 * scale, '#ced4da');
  y -= 20 * scale;
  
  drawShadowText(date, x, y, 15 * scale, '#ffffff');
  y -= 24 * scale;
  
  if (road) {
    drawShadowText(road, x, y, 15 * scale, '#d8f3dc');
    y -= 24 * scale;
  }
  
  drawShadowText(address, x, y, 22 * scale, '#ffffff', true);
  y -= 30 * scale;
  
  if (count) {
    drawShadowText(count, x, y, 17 * scale, '#ffffff', true);
    y -= 24 * scale;
  }
  
  drawShadowText(crop, x, y, 20 * scale, '#52b788', true);
}

// Format Date Time to YYYY-MM-DD HH:MM:SS
function getFormattedDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

// Download Watermarked JPEG
function downloadWatermarkedImage() {
  if (!state.image) return;
  
  // Get dynamic filename elements
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const addrClean = (state.address || '수동입력필지').replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim().substring(0, 20);
  const cropClean = state.crop.replace(/[^a-zA-Z0-9가-힣]/g, '');
  const filename = `${dateStr}_${addrClean}_${cropClean}.jpg`;
  
  // Export canvas to blob
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    
    // Programmatic anchor click download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('인증 사진이 저장 폴더에 저장되었습니다.');
  }, 'image/jpeg', 0.92);
}

// Open Download Modal for Mobile long-press fallback
function openDownloadModal() {
  if (!state.image) return;
  
  // Set image src from canvas (data URL is safest for mobile img elements)
  resultImage.src = canvas.toDataURL('image/jpeg', 0.92);
  
  // Open modal
  downloadModal.classList.add('open');
}

// Show Toast Alert Notification
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Load photos from IndexedDB and display in the album grid
function loadAlbum() {
  if (!state.db) return;
  
  getAllPhotosFromDB(state.db)
    .then((photos) => {
      const count = photos.length;
      document.getElementById('album-count').textContent = `${count}장`;
      
      const grid = document.getElementById('album-grid');
      grid.innerHTML = '';
      
      if (count === 0) {
        grid.innerHTML = '<div class="album-empty">저장된 인증 사진이 없습니다.<br><small style="font-size: 0.7rem; opacity: 0.7;">사진을 촬영하면 이곳에 자동으로 보관됩니다.</small></div>';
        return;
      }
      
      // Newest photos first
      photos.slice().reverse().forEach((photo) => {
        const item = document.createElement('div');
        item.className = 'album-item';
        
        // Show crop name and bale count in brief format
        const labelText = photo.baleCount ? `${photo.crop} (${photo.baleCount}개)` : photo.crop;
        
        item.innerHTML = `
          <img src="${photo.dataUrl}" alt="필지인증사진">
          <div class="album-item-info">${labelText}</div>
        `;
        
        item.addEventListener('click', () => {
          openZoomModal(photo);
        });
        
        grid.appendChild(item);
      });
    })
    .catch((err) => console.error('Album load failed:', err));
}

// Open Photo Zoom view modal
function openZoomModal(photo) {
  state.currentZoomPhoto = photo;
  zoomImage.src = photo.dataUrl;
  
  const gpsStr = photo.latitude 
    ? `위도: ${photo.latitude.toFixed(6)}, 경도: ${photo.longitude.toFixed(6)}` 
    : '위치 정보 없음';
    
  zoomMetadata.innerHTML = `
    <div style="margin-bottom: 0.25rem;"><strong>지번 주소:</strong> ${photo.address || '수동입력'}</div>
    <div style="margin-bottom: 0.25rem;"><strong>도로명 주소:</strong> ${photo.roadAddress || '없음'}</div>
    <div style="margin-bottom: 0.25rem;"><strong>작물명:</strong> ${photo.crop}</div>
    <div style="margin-bottom: 0.25rem;"><strong>수확 개수:</strong> ${photo.baleCount ? photo.baleCount + '개' : '입력 안 됨'}</div>
    <div style="margin-bottom: 0.25rem;"><strong>촬영 시각:</strong> ${photo.date}</div>
    <div><strong>GPS 수신 좌표:</strong> ${gpsStr}</div>
  `;
  
  zoomModal.classList.add('open');
}

// Reset photo preview and inputs for next capture session (화면 초기화)
function resetPhotoState() {
  state.image = null;
  canvas.style.display = 'none';
  placeholderView.style.display = 'flex';
  previewBox.classList.remove('active');
  downloadBtn.setAttribute('disabled', 'true');
  imageInput.value = '';
  
  // Reset fields for the next session
  baleCountInput.value = '';
  modalBaleCountInput.value = '';
  parcelMemoInput.value = '';
  
  console.log('Photo state and inputs have been reset for the next capture.');
}

// Check if the current environment is KakaoTalk WebView
function isKakaoTalkWebView() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.indexOf('kakaotalk') !== -1;
}
