import { useUIStateStore } from "../stores/UIStore";

type NavbarProps = {
    setSidebarEnabled: (val: boolean | ((prev: boolean) => boolean)) => void
    sidebarEnabled: boolean
    userHasHEVC: boolean
    videoIsHEVC: boolean | null
}
export default function Navbar({ setSidebarEnabled, sidebarEnabled }: NavbarProps ) {
    const cols = useUIStateStore((s: any) => s.cols);
    const setCols = useUIStateStore((s: any) => s.setCols);

    const handleBigger = () => setCols(Math.max(1, cols - 1));
    const handleSmaller = () => setCols(Math.min(12, cols + 1));
    return (
        <div className="navbar">
            <div className="left-nav">
                <svg
                    onClick={() => setSidebarEnabled(prev => !prev)}
                    width="24" height="24" viewBox="0 0 24 24"
                    fill="none" xmlns="http://www.w3.org/2000/svg"
                    style={{ transform: sidebarEnabled ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                >
                    <path d="M9 6l6 6-6 6" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h1><span>AMV</span>erge</h1>
            </div>

            <div className="zoomWrapper">
                <span>Grid: {cols} columns</span>
                <form>
                <button type="button" onClick={handleBigger}>-</button>
                <button type="button" onClick={handleSmaller}>+</button>  
                </form>
            </div>
        </div>
    )
}