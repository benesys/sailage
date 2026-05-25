/*
 * Forage Parcel Camera App Javascript Logic (조사료 필지 카메라 앱 로직)
 */

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
  watermarkStyle: 'dark-banner',
  kakaoKey: localStorage.getItem('kakao_app_key') || '',
  geocoder: null,
  map: null,
  gpsTimer: null
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

const styleOptions = document.querySelectorAll('.style-option');
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

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  // Load saved configuration
  if (state.kakaoKey) {
    kakaoKeyInput.value = state.kakaoKey;
    loadKakaoMapsSdk();
  }
  
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
  
  // Watermark style selector
  styleOptions.forEach(option => {
    option.addEventListener('click', () => {
      styleOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      state.watermarkStyle = option.getAttribute('data-style');
      drawWatermark();
    });
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
  const closeDownload = () => downloadModal.classList.remove('open');
  closeDownloadBtn.addEventListener('click', closeDownload);
  closeDownloadBtn2.addEventListener('click', closeDownload);
  downloadModal.addEventListener('click', (e) => {
    if (e.target === downloadModal) closeDownload();
  });
  
  directDownloadBtn.addEventListener('click', () => {
    closeDownload();
    downloadWatermarkedImage();
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
  
  script.onload = () => {
    kakao.maps.load(() => {
      state.geocoder = new kakao.maps.services.Geocoder();
      console.log('Kakao maps SDK & Geocoder loaded successfully.');
      gpsDetailDisplay.innerHTML = '<span style="color: var(--gps-good);">카카오 맵 SDK 연결 성공</span>';
      
      if (state.latitude && state.longitude) {
        fetchAddressFromCoords(state.latitude, state.longitude);
        updateMinimap(state.latitude, state.longitude);
      }
    });
  };
  
  script.onerror = () => {
    console.error('Failed to load Kakao Maps SDK.');
    gpsDetailDisplay.innerHTML = '<span style="color: var(--gps-poor); font-weight: bold;">[API 오류] 카카오 SDK 로드 실패. 인터넷 연결 또는 키를 확인하세요.</span>';
  };
  
  document.head.appendChild(script);
}

// Convert Coordinates to Address
function fetchAddressFromCoords(lat, lng) {
  if (!state.geocoder) {
    const keyStatus = state.kakaoKey ? '키는 입력됨, SDK 로드 대기' : '카카오 API 키 입력 필요 (우측 상단 톱니바퀴)';
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
      }
      
      if (addressObj.road_address) {
        state.roadAddress = addressObj.road_address.address_name;
        roadAddressInput.value = state.roadAddress;
      } else {
        state.roadAddress = '도로명 주소 없음';
        roadAddressInput.value = state.roadAddress;
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
      showToast('사진이 로드되었습니다.');
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
  if (state.watermarkStyle === 'dark-banner') {
    renderDarkBanner(imgWidth, imgHeight, scale, addressStr, roadStr, dateStr, gpsStr, cropStr, countStr, inspectorStr, memoStr);
  } else if (state.watermarkStyle === 'mint-card') {
    renderMintCard(imgWidth, imgHeight, scale, addressStr, roadStr, dateStr, gpsStr, cropStr, countStr, inspectorStr, memoStr);
  } else {
    renderMinimal(imgWidth, imgHeight, scale, addressStr, roadStr, dateStr, gpsStr, cropStr, countStr, inspectorStr, memoStr);
  }
}

// Render: Style 1 - Dark Ribbon Banner at Bottom
function renderDarkBanner(width, height, scale, address, road, date, gps, crop, count, inspector, memo) {
  // Banner height
  const bannerHeight = 175 * scale;
  
  // Draw banner backdrop
  ctx.fillStyle = 'rgba(27, 67, 50, 0.85)'; // Transparent Deep Forest Green
  ctx.fillRect(0, height - bannerHeight, width, bannerHeight);
  
  // Left border highlight
  ctx.fillStyle = '#52b788'; // Mint Accent
  ctx.fillRect(0, height - bannerHeight, 8 * scale, bannerHeight);
  
  // Font configuration
  ctx.textBaseline = 'top';
  
  // Column 1 - Addresses & Date (Left)
  let yOffset = height - bannerHeight + 20 * scale;
  const paddingLeft = 25 * scale;
  
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${22 * scale}px "Outfit", "Noto Sans KR"`;
  ctx.fillText(address, paddingLeft, yOffset);
  
  yOffset += 32 * scale;
  ctx.font = `${16 * scale}px "Outfit", "Noto Sans KR"`;
  ctx.fillStyle = '#d8f3dc'; // Soft green-white
  if (road) {
    ctx.fillText(road, paddingLeft, yOffset);
    yOffset += 24 * scale;
  }
  
  ctx.fillStyle = '#ffffff';
  ctx.fillText(date, paddingLeft, yOffset);
  
  yOffset += 24 * scale;
  ctx.fillStyle = '#a3b899'; // Muted grayish green
  ctx.font = `${14 * scale}px monospace`;
  ctx.fillText(gps, paddingLeft, yOffset);
  
  // Column 2 - Crop, Inspector & Notes (Right)
  yOffset = height - bannerHeight + 20 * scale;
  const rightAlignX = width - 25 * scale;
  ctx.textAlign = 'right';
  
  ctx.fillStyle = '#52b788'; // Accent color for crop name
  ctx.font = `bold ${22 * scale}px "Outfit", "Noto Sans KR"`;
  ctx.fillText(crop, rightAlignX, yOffset);
  
  yOffset += 32 * scale;
  
  if (count) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${18 * scale}px "Outfit", "Noto Sans KR"`;
    ctx.fillText(count, rightAlignX, yOffset);
    yOffset += 26 * scale;
  }
  
  ctx.fillStyle = '#ffffff';
  ctx.font = `${16 * scale}px "Outfit", "Noto Sans KR"`;
  
  if (inspector) {
    ctx.fillText(inspector, rightAlignX, yOffset);
    yOffset += 24 * scale;
  }
  
  if (memo) {
    ctx.font = `italic ${15 * scale}px "Outfit", "Noto Sans KR"`;
    ctx.fillStyle = '#e9ecef';
    ctx.fillText(memo, rightAlignX, yOffset);
  }
  
  // Reset text alignment
  ctx.textAlign = 'left';
}

// Render: Style 2 - Premium Mint Card Bottom Right
function renderMintCard(width, height, scale, address, road, date, gps, crop, count, inspector, memo) {
  // Card dimensions
  const cardWidth = 420 * scale;
  const cardHeight = 220 * scale;
  const padding = 20 * scale;
  
  const cardX = width - cardWidth - padding;
  const cardY = height - cardHeight - padding;
  
  // Draw card background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 20 * scale;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(cardX, cardY, cardWidth, cardHeight, 12 * scale) : ctx.rect(cardX, cardY, cardWidth, cardHeight);
  ctx.fill();
  
  // Reset shadow for text
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  
  // Left border bar
  ctx.fillStyle = '#2d6a4f'; // Medium forest green
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(cardX, cardY, 8 * scale, cardHeight, [12 * scale, 0, 0, 12 * scale]) : ctx.rect(cardX, cardY, 8 * scale, cardHeight);
  ctx.fill();
  
  // Text spacing
  ctx.textBaseline = 'top';
  let y = cardY + 15 * scale;
  const textX = cardX + 25 * scale;
  
  // Crop Badge & Count
  ctx.fillStyle = '#40916c';
  ctx.font = `bold ${14 * scale}px "Outfit", "Noto Sans KR"`;
  const badgeText = count ? `[ ${crop.toUpperCase()} ] | ${count}` : `[ ${crop.toUpperCase()} ]`;
  ctx.fillText(badgeText, textX, y);
  
  y += 26 * scale;
  
  // Address
  ctx.fillStyle = '#1c251f';
  ctx.font = `bold ${18 * scale}px "Outfit", "Noto Sans KR"`;
  ctx.fillText(address, textX, y);
  
  y += 26 * scale;
  
  // Road
  if (road) {
    ctx.fillStyle = '#5e6b62';
    ctx.font = `${14 * scale}px "Outfit", "Noto Sans KR"`;
    ctx.fillText(road, textX, y);
    y += 22 * scale;
  }
  
  // Date
  ctx.fillStyle = '#1c251f';
  ctx.font = `${14 * scale}px "Outfit", "Noto Sans KR"`;
  ctx.fillText(date, textX, y);
  
  y += 22 * scale;
  
  // GPS
  ctx.fillStyle = '#5e6b62';
  ctx.font = `${12 * scale}px monospace`;
  ctx.fillText(gps, textX, y);
  
  y += 20 * scale;
  
  // Inspector & Note
  if (inspector || memo) {
    const extra = [inspector, memo].filter(Boolean).join(' | ');
    ctx.fillStyle = '#2d6a4f';
    ctx.font = `bold ${13 * scale}px "Outfit", "Noto Sans KR"`;
    ctx.fillText(extra, textX, y);
  }
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
