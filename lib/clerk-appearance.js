export const clerkAppearance = {
  unsafe_disableDevelopmentModeWarnings: true,
  variables: {
    colorPrimary: "#9650ed",
    colorBackground: "#201e2b",
    colorInputBackground: "#13111c",
    colorInputText: "#eee8f7",
    colorText: "#f4f1fc",
    colorTextSecondary: "#aaa3bb",
    colorNeutral: "#d7d0e5",
    borderRadius: "0.65rem",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  elements: {
    footer: { display: "none" },
    footerItem: { display: "none" },
    footerAction: { display: "none" },
    footerActionText: { display: "none" },
    footerActionLink: { display: "none" },
    footerPages: { display: "none" },
    footerPagesLink: { display: "none" },
    badge: { display: "none" },
    cardBox: {
      "& > div:nth-child(n + 2)": { display: "none" },
    },
  },
};
