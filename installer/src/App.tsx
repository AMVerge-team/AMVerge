import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { 
  FaMinus, 
  FaTimes, 
  FaMicrochip, 
  FaFolder, 
  FaCheck, 
  FaSearch, 
  FaLayerGroup, 
  FaCube, 
  FaArrowRight, 
  FaPlay 
} from 'react-icons/fa';

interface SystemSpecs {
  gpuName: string;
  hasCuda: boolean;
  defaultPath: string;
}

interface InstallProgress {
  percent: number;
  message: string;
}

const CAROUSEL_SLIDES = [
  {
    icon: <FaLayerGroup />,
    title: "Instant Scene Cut Detection",
    desc: "TransNetV2 neural network scans episodes in seconds to extract every cut cleanly without keyframe drift."
  },
  {
    icon: <FaSearch />,
    title: "AI Scene Scout Search",
    desc: "Describe visual moments in plain text (e.g., 'naruto glowing punch') powered by SigLIP 2 embeddings."
  },
  {
    icon: <FaCube />,
    title: "Depth Map Pass",
    desc: "Generate monocular 3D depth maps on export using Depth-Anything-V2 for advanced VFX displacement."
  },
  {
    icon: <FaPlay />,
    title: "Direct NLE Timeline Export",
    desc: "Send selected scenes straight to DaVinci Resolve or Adobe timelines with perfect frame accuracy."
  }
];

export default function App() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [specs, setSpecs] = useState<SystemSpecs>({
    gpuName: 'Detecting GPU...',
    hasCuda: false,
    defaultPath: 'C:\\Users\\Moongetsu\\AppData\\Local\\Programs\\AMVerge'
  });

  // Feature selection
  const [installPath, setInstallPath] = useState(specs.defaultPath);
  const [optTransnet, setOptTransnet] = useState(true);
  const [optScout, setOptScout] = useState(false);
  const [optDepth, setOptDepth] = useState(false);
  const [optUpscale, setOptUpscale] = useState(false);
  
  // System integration
  const [optContextMenu, setOptContextMenu] = useState(true);
  const [optDesktopShortcut, setOptDesktopShortcut] = useState(true);
  const [optPathEnv, setOptPathEnv] = useState(true);

  // States: 'configure' | 'installing' | 'completed'
  const [step, setStep] = useState<'configure' | 'installing' | 'completed'>('configure');
  const [progress, setProgress] = useState<InstallProgress>({ percent: 0, message: 'Initializing installer...' });

  useEffect(() => {
    // Rotate carousel slides
    const timer = setInterval(() => {
      setActiveSlide(s => (s + 1) % CAROUSEL_SLIDES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Read hardware specs
    invoke<SystemSpecs>('get_system_info')
      .then(s => {
        setSpecs(s);
        setInstallPath(s.defaultPath);
      })
      .catch(() => {});

    // Listen to progress events from backend
    const unlisten = listen<InstallProgress>('install://progress', event => {
      setProgress(event.payload);
      if (event.payload.percent >= 100) {
        setTimeout(() => setStep('completed'), 800);
      }
    });

    return () => {
      void unlisten.then(fn => fn());
    };
  }, []);

  const handleMinimize = () => void getCurrentWindow().minimize();
  const handleClose = () => void getCurrentWindow().close();

  const handleSelectFolder = async () => {
    try {
      const selected = await invoke<string | null>('select_folder');
      if (selected) setInstallPath(selected);
    } catch {}
  };

  const handleStartInstall = async () => {
    setStep('installing');
    try {
      await invoke('start_installation', {
        config: {
          targetPath: installPath,
          features: {
            transnet: optTransnet,
            scout: optScout,
            depth: optDepth,
            upscale: optUpscale
          },
          contextMenu: optContextMenu,
          desktopShortcut: optDesktopShortcut,
          addToPath: optPathEnv
        }
      });
    } catch (err) {
      setProgress({ percent: 0, message: `Error: ${err}` });
    }
  };

  const handleLaunchApp = async () => {
    await invoke('launch_amverge', { targetPath: installPath });
    await getCurrentWindow().close();
  };

  const slide = CAROUSEL_SLIDES[activeSlide];

  return (
    <div className="installer-window">
      {/* Titlebar */}
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-brand" data-tauri-drag-region>
          <img src="/icons/128x128.png" className="titlebar-logo" alt="AMVerge" />
          <span data-tauri-drag-region>AMV</span>erge Setup
        </div>
        <div className="titlebar-controls">
          <button type="button" className="titlebar-btn" onClick={handleMinimize} title="Minimize">
            <FaMinus size={11} />
          </button>
          <button type="button" className="titlebar-btn close" onClick={handleClose} title="Close">
            <FaTimes size={13} />
          </button>
        </div>
      </div>

      {/* Body View */}
      {step === 'configure' && (
        <div className="installer-body">
          {/* Hero & Carousel */}
          <div className="hero-showcase">
            <div className="hero-left">
              <h1 className="hero-title">Elevate Your <span>AMV</span> Workflow</h1>
              <p className="hero-subtitle">
                Supercharge your scene skimming, video management and AI editing workflow.
              </p>
              <div className="hardware-badge">
                <FaMicrochip /> {specs.gpuName} {specs.hasCuda && '(CUDA Ready)'}
              </div>
            </div>

            <div className="carousel-box">
              <div className="carousel-title">{slide.icon} {slide.title}</div>
              <div className="carousel-desc">{slide.desc}</div>
              <div className="carousel-dots">
                {CAROUSEL_SLIDES.map((_, i) => (
                  <div key={i} className={`dot ${i === activeSlide ? 'active' : ''}`} />
                ))}
              </div>
            </div>
          </div>

          {/* Options Grid */}
          <div className="options-container">
            {/* Left: AI Feature Packs */}
            <div>
              <div className="option-group-title">AI & Extended Features</div>
              
              <label className="feature-item">
                <input 
                  type="checkbox" 
                  checked={optTransnet} 
                  onChange={e => setOptTransnet(e.target.checked)} 
                />
                <div className="feature-info">
                  <div className="feature-name">
                    AI Scene Detection <span className="feature-size">~60 MB</span>
                  </div>
                  <div className="feature-desc">TransNetV2 neural cuts with zero keyframe drift.</div>
                </div>
              </label>

              <label className="feature-item">
                <input 
                  type="checkbox" 
                  checked={optScout} 
                  onChange={e => setOptScout(e.target.checked)} 
                />
                <div className="feature-info">
                  <div className="feature-name">
                    Scene Scout AI <span className="feature-size">~900 MB</span>
                  </div>
                  <div className="feature-desc">Natural language visual search (SigLIP 2).</div>
                </div>
              </label>

              <label className="feature-item">
                <input 
                  type="checkbox" 
                  checked={optDepth} 
                  onChange={e => setOptDepth(e.target.checked)} 
                />
                <div className="feature-info">
                  <div className="feature-name">
                    Depth Map Pass <span className="feature-size">~95 MB</span>
                  </div>
                  <div className="feature-desc">Monocular depth estimation (Depth-Anything-V2).</div>
                </div>
              </label>

              <label className="feature-item">
                <input 
                  type="checkbox" 
                  checked={optUpscale} 
                  onChange={e => setOptUpscale(e.target.checked)} 
                />
                <div className="feature-info">
                  <div className="feature-name">
                    Upscale Pass <span className="feature-size">~120 MB</span>
                  </div>
                  <div className="feature-desc">AI super-resolution with Adore & ShuffleCUGAN.</div>
                </div>
              </label>
            </div>

            {/* Right: Path & Integrations */}
            <div>
              <div className="option-group-title">Installation Path</div>
              <div className="path-selector">
                <input 
                  type="text" 
                  className="path-input" 
                  value={installPath} 
                  onChange={e => setInstallPath(e.target.value)} 
                />
                <button type="button" className="browse-btn" onClick={handleSelectFolder}>
                  <FaFolder />
                </button>
              </div>

              <div className="option-group-title" style={{ marginTop: 14 }}>System Integration</div>
              
              <label className="feature-item">
                <input 
                  type="checkbox" 
                  checked={optContextMenu} 
                  onChange={e => setOptContextMenu(e.target.checked)} 
                />
                <div className="feature-info">
                  <div className="feature-name">Windows Explorer Integration</div>
                  <div className="feature-desc">Adds "Open with AMVerge" to video context menu.</div>
                </div>
              </label>

              <label className="feature-item">
                <input 
                  type="checkbox" 
                  checked={optDesktopShortcut} 
                  onChange={e => setOptDesktopShortcut(e.target.checked)} 
                />
                <div className="feature-info">
                  <div className="feature-name">Desktop & Start Menu Shortcuts</div>
                  <div className="feature-desc">Quick access from desktop and Windows search.</div>
                </div>
              </label>

              <label className="feature-item">
                <input 
                  type="checkbox" 
                  checked={optPathEnv} 
                  onChange={e => setOptPathEnv(e.target.checked)} 
                />
                <div className="feature-info">
                  <div className="feature-name">Add to User PATH</div>
                  <div className="feature-desc">Run `amverge` directly from Terminal / PowerShell.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="installer-footer">
            <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
              Target: <span style={{ color: 'var(--text-main)' }}>Per-User (%LocalAppData%)</span> · No UAC Admin needed
            </div>
            <button type="button" className="install-btn" onClick={handleStartInstall}>
              Install AMVerge <FaArrowRight />
            </button>
          </div>
        </div>
      )}

      {/* Progress Screen */}
      {step === 'installing' && (
        <div className="progress-screen">
          <img src="/icons/128x128.png" style={{ width: 64, height: 64, marginBottom: 16 }} alt="AMVerge" />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Installing AMVerge...</h2>
          
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
          </div>

          <div className="progress-text">{progress.message}</div>
        </div>
      )}

      {/* Completed Screen */}
      {step === 'completed' && (
        <div className="progress-screen">
          <div style={{ 
            width: 64, 
            height: 64, 
            borderRadius: '50%', 
            background: 'rgba(204, 255, 0, 0.15)', 
            border: '2px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
            fontSize: '1.6rem',
            marginBottom: 20
          }}>
            <FaCheck />
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>Setup Complete!</h2>
          <p style={{ color: 'var(--text-dim)', maxWidth: 440, fontSize: '0.9rem', marginBottom: 28, lineHeight: 1.5 }}>
            AMVerge has been successfully installed and configured with your chosen components.
          </p>

          <button type="button" className="install-btn" onClick={handleLaunchApp}>
            Launch AMVerge <FaPlay size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
