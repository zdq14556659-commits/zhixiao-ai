<template>
  <div class="audio-player" v-if="src">
    <div class="audio-controls">
      <el-button :type="isPlaying ? 'danger' : 'primary'" :icon="isPlaying ? VideoPause : VideoPlay" circle @click="togglePlay" />
      <div class="audio-progress" ref="progressRef" @click="seekAudio">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          <div class="progress-thumb" :style="{ left: progressPercent + '%' }"></div>
        </div>
      </div>
      <span class="audio-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      <el-icon class="volume-icon" :size="18" @click="toggleMute"><Mute v-if="isMuted" /><VideoPlay v-else /></el-icon>
      <el-slider v-model="volume" :show-tooltip="false" :min="0" :max="1" :step="0.01" class="volume-slider" @input="setVolume" />
    </div>
    <audio ref="audioRef" :src="src" @timeupdate="onTimeUpdate" @loadedmetadata="onLoaded" @ended="onEnded"></audio>
  </div>
  <el-empty v-else description="暂无音频" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  src: string
}>()

const emit = defineEmits(['play', 'pause', 'ended'])

const audioRef = ref<HTMLAudioElement>()
const progressRef = ref<HTMLElement>()
const isPlaying = ref(false)
const isMuted = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.8)

const progressPercent = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

function togglePlay() {
  if (!audioRef.value) return
  if (isPlaying.value) {
    audioRef.value.pause()
    emit('pause')
  } else {
    audioRef.value.play()
    emit('play')
  }
  isPlaying.value = !isPlaying.value
}

function seekAudio(e: MouseEvent) {
  if (!audioRef.value || !progressRef.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  audioRef.value.currentTime = percent * duration.value
}

function toggleMute() {
  if (!audioRef.value) return
  isMuted.value = !isMuted.value
  audioRef.value.muted = isMuted.value
}

function setVolume(val: number) {
  if (!audioRef.value) return
  audioRef.value.volume = val
}

function onTimeUpdate() {
  if (!audioRef.value) return
  currentTime.value = audioRef.value.currentTime
}

function onLoaded() {
  if (!audioRef.value) return
  duration.value = audioRef.value.duration
}

function onEnded() {
  isPlaying.value = false
  currentTime.value = 0
  emit('ended')
}

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

watch(() => props.src, () => {
  isPlaying.value = false
  currentTime.value = 0
  duration.value = 0
})
</script>

<style scoped>
.audio-player {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 16px;
}

.audio-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-progress {
  flex: 1;
  cursor: pointer;
  padding: 8px 0;
}

.progress-track {
  height: 4px;
  background: #dcdfe6;
  border-radius: 2px;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: #409EFF;
  border-radius: 2px;
  transition: width 0.1s;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  background: #409EFF;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.2s;
}

.progress-track:hover .progress-thumb {
  opacity: 1;
}

.audio-time {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  min-width: 80px;
}

.volume-icon {
  cursor: pointer;
  color: #606266;
}

.volume-slider {
  width: 80px;
}
</style>
