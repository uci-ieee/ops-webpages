#include "common.h"
#include <Arduino.h>

bool manualMode{false}; // tracks current mode (true = manual, false = auto)

// function for handling the state of the button
bool handleButton() {
    static bool lastReading{HIGH};           // previous raw button read (for edge detection)
    static bool stableState{HIGH};           // debounced stable button state
    static unsigned long lastDebounceTime{}; // time when input last changed (debounce timing)

    bool reading{digitalRead(BUTTON_PIN)};   // current raw button reading
    unsigned long now{millis()};             // current system time in ms

    if (reading != lastReading) {
        lastDebounceTime = now; // reset debounce timer on change
    }

    if ((now - lastDebounceTime) > DEBOUNCE_DELAY) {
        if (reading != stableState) {
            stableState = reading; // accept new stable state

            if (stableState == LOW) {
                manualMode = !manualMode; // toggle mode on button press
            }
        }
    }

    lastReading = reading; // store latest raw reading

    return manualMode; // return current mode
}

// function for detecting if mode is switched from manual to auto 
bool modeChangedToAuto() {
    static bool lastModeSnapshot{false}; // previous mode state (for detecting transitions)

    bool currentMode{manualMode}; // current mode snapshot
    bool transitioned{lastModeSnapshot && !currentMode}; // true if manual to auto

    lastModeSnapshot = currentMode; // update stored state for next call

    return transitioned; // return whether transition occurred
}