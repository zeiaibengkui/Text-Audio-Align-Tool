<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

interface Cue {
    text: string
    start: number
    end: number
}

const stage = ref<HTMLElement | null>(null)
const reel = ref<HTMLElement | null>(null)
const cues = ref<Cue[]>([])
const now = ref(0)
const duration = ref(0)
const playing = ref(false)
const error = ref('')

const ui = {
    newOnLeft: true,
    fontScale: 1,
    revealRate: 1,
    gap: 16,
}

const audio = () => document.getElementById('audio') as HTMLAudioElement

// 依据方向确定简片顺序：新字在左 => 最早的在右（从右往左读）
const display = computed(() => (ui.newOnLeft ? cues.value.slice().reverse() : cues.value.slice()))

const activeK = computed(() => {
    let k = -1
    for (let i = 0; i < cues.value.length; i++) {
        const c = cues.value[i]
        if (c && c.start <= now.value) k = i
    }
    return k
})

const activeDisp = computed(() => {
    const k = activeK.value
    if (k < 0) return -1
    return ui.newOnLeft ? cues.value.length - 1 - k : k
})

const stageVars = computed(() => ({
    '--font-scale': String(ui.fontScale),
    '--gap': ui.gap + 'px',
}))

function revealFrac(d: number): number {
    const c = display.value[d]
    if (!c || now.value < c.start) return 0
    if (now.value >= c.end) return 1
    return (now.value - c.start) / (c.end - c.start)
}

function chars(c: Cue): string[] {
    return c.text.split('')
}

function revealedCount(d: number, len: number): number {
    const f = Math.min(1, revealFrac(d) * ui.revealRate)
    return Math.round(f * len)
}

function fmt(s: number): string {
    s = Math.max(0, s || 0)
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
}

// 用原生 scrollIntoView 把当前书写的那枚竹简滚动到目标侧
function scrollActive() {
    const d = activeDisp.value
    if (d < 0) return
    const els = reel.value?.querySelectorAll('.slip')
    const el = els && (els[d] as HTMLElement)
    el?.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'center',
    })
}

watch(activeDisp, () => scrollActive())

let raf = 0
let destroyed = false

function loop() {
    if (destroyed) return
    now.value = audio().currentTime
    raf = requestAnimationFrame(loop)
}

async function load() {
    try {
        const res = await fetch('/align.json')
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json()
        cues.value = data.cues || []
        duration.value = data.duration || 0
        const a = audio()
        a.src = '/' + String(data.audio || 'data/audio.mp3')
        await nextTick()
        scrollActive()
        raf = requestAnimationFrame(loop)
    } catch {
        error.value = '无法读取 /align.json。请先运行 python export_align.py 生成数据。'
    }
}

function toggle() {
    const a = audio()
    if (a.paused) a.play()
    else a.pause()
    playing.value = !a.paused
}

function seek(v: unknown) {
    audio().currentTime = Number(v)
}

const timeValue = computed({
    get: () => now.value,
    set: (v) => seek(v),
})

onMounted(load)
onBeforeUnmount(() => {
    destroyed = true
    cancelAnimationFrame(raf)
})
</script>

<template>
    <div class="stage" ref="stage" :style="stageVars">
        <div class="reel" ref="reel">
            <div class="slip" v-for="(c, i) in display" :key="i">
                <span
                    v-for="(ch, j) in chars(c)"
                    :key="j"
                    class="ch"
                    :class="{ on: j < revealedCount(i, c.text.length) }"
                    >{{ ch }}</span
                >
            </div>
        </div>

        <div class="seal">印经</div>
        <h1 class="hint">善润华年</h1>

        <div class="hud">
            <b-button size="sm" class="w-25" variant="outline-dark" @click="toggle">
                {{ playing ? '暂停' : '播放' }}
            </b-button>
            <b-form-input
                class="flex-grow-1"
                type="range"
                v-model="timeValue"
                :min="0"
                :max="duration || 0"
                step="0.01"
            />
            <span class="time">{{ fmt(now) }} / {{ fmt(duration) }}</span>
        </div>

        <audio id="audio" preload="auto" @play="playing = true" @pause="playing = false"></audio>
        <div class="error" v-if="error">{{ error }}</div>
    </div>
</template>

<style>
:root {
    --ink: #2b1c0e;
    --accent: #a33;
}
html,
body {
    margin: 0;
    height: 100%;
    overflow: hidden;
    background: #d8c9a8;
    font-family:
        /* 'Chiron Hei HK WS', 'Noto Sans CJK SC', 'PingFang SC', 'fangsong', 'KaiTi', */
        'Noto Serif CJK SC', 'Songti SC', 'SimSun', sans-serif;
}
.stage {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #d8c9a8 url('/bg.jpg') center / cover no-repeat;
}
.stage::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: rgba(246, 240, 224, 0.22);
}
.reel {
    position: absolute;
    inset: 0;
    height: 100%;
    display: flex;
    align-items: center;
    gap: var(--gap, 16px);
    padding: 0 70px;
    overflow-x: hidden;
    overflow-y: hidden;
    scroll-behavior: smooth;
}
.slip {
    writing-mode: vertical-rl;
    height: 82vh;
    max-height: 82vh;
    flex: 0 0 auto;
    border-right: 1px solid rgba(70, 45, 20, 0.35);
    padding: 22px 14px 22px 16px;
    font-size: calc(clamp(28px, 4.1vw, 50px) * var(--font-scale, 1));
    line-height: 1.16;
    letter-spacing: 0.04em;
    color: var(--ink);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
}
.slip .ch {
    opacity: 0;
    transition: opacity 3s linear;
}
.slip .ch.on {
    opacity: 1;
}
.seal {
    position: fixed;
    right: 34px;
    bottom: 40px;
    writing-mode: vertical-rl;
    font-size: 26px;
    font-weight: 700;
    color: var(--accent);
    opacity: 0.8;
    letter-spacing: 0.2em;
    user-select: none;
}
.hint {
    position: fixed;
    left: 50%;
    top: 18px;
    transform: translateX(-50%);
    /* font-size: 13px; */
    color: rgba(90, 60, 30, 0.75);
    letter-spacing: 0.1em;
}
.hud {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 14px;
    width: min(620px, 92vw);
    background: rgba(255, 250, 240, 0.78);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(70, 45, 20, 0.2);
    border-radius: 999px;
    padding: 8px 16px;
}
.hud .time {
    font-variant-numeric: tabular-nums;
    min-width: 100px;
    text-align: center;
    font-size: 14px;
    color: var(--ink);
}
.error {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 16px;
    color: #f5c6c6;
    text-align: center;
    background: rgba(0, 0, 0, 0.4);
    padding: 14px 20px;
    border-radius: 8px;
}
</style>
