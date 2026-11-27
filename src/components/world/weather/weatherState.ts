// Per-frame weather factors (0..1), outside React. WeatherDriver is the only writer;
// ThemeDriver, Sky and the weather meshes read them.
export const weather = { rain: 0, mist: 0, wet: 0 };
