// Parts of the app that are built but switched off for now. Turning one back on is this
// file alone; the screens and the backend are untouched while it is off.

// Fuel: Settings → Fuel, the Loads page's Fuel column, row button and plan card, the
// truck form's fuel settings, and the fuel modules in the role editor.
export const FUEL_ENABLED = false;

// The permission modules that belong to fuel. Hidden from the role editor while fuel is
// off, but a role's existing grants on them are kept when it is saved.
export const FUEL_MODULES = ["fuel_plans", "fuel_settings"];
