#pragma once

// ultrasonic sensor pins
constexpr int ECHO_PIN{4};
constexpr int TRIG_PIN{5};

// servo pin
constexpr int SERVO_PIN{10};

// servo step ammount
constexpr int STEP_SIZE{2};

// button pin
constexpr int BUTTON_PIN{8};

// button press debounce delay 
constexpr unsigned long DEBOUNCE_DELAY{10};

// potentiometer pin
constexpr int POT_PIN{1};

// function declarations
float getDistance();      // function for getting the distance from ultrasonic sensor
bool handleButton();      // returns current mode (true = manual)
bool modeChangedToAuto(); // detects manual and changes to auto transition