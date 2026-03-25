import type React from "react";

export type Page = "home" | "settings";

const buttons: { name: string; page: Page }[] = [
    {
        name: "Home",
        page: "home",
    },
    {
        name: "Settings",
        page: "settings",
    },
];

type ButtonProps = {
    name: string;
    page: Page;
    activePage: Page;
    setActivePage: React.Dispatch<React.SetStateAction<Page>>;
};

function ButtonComponent({ name, page, activePage, setActivePage }: ButtonProps) {
    return (
        <div className="sidebar-button">
            <button
                onClick={() => setActivePage(page)}
                disabled={activePage === page}
                aria-current={activePage === page ? "page" : undefined}
            >
                {name}
            </button>
        </div>
    )
}

type SidebarProps = {
    activePage: Page;
    setActivePage: React.Dispatch<React.SetStateAction<Page>>;
};

export default function Sidebar({ activePage, setActivePage }: SidebarProps) {
    return (
        <div className="sidebar-container">
            {
                buttons.map((button) => (
                    <ButtonComponent
                        key={button.page}
                        name={button.name}
                        page={button.page}
                        activePage={activePage}
                        setActivePage={setActivePage}
                    />
                ))    
            }
            <div className="eps-container">
                <p>hi work in progress</p>
            </div>
        </div>
    )
}