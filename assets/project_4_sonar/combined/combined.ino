#include <ESP32Servo.h>

// pin definitions
constexpr int ECHO_PIN{4};   // ultrasonic echo pin
constexpr int TRIG_PIN{5};   // ultrasonic trigger pin
constexpr int SERVO_PIN{10}; // servo control pin
constexpr int BUTTON_PIN{8}; // mode button pin
constexpr int POT_PIN{1};    // potentiometer pin

// variables for configuration
constexpr int STEP_SIZE{2};                 // servo step amount in auto mode
constexpr unsigned long DEBOUNCE_DELAY{10}; // button debounce delay in ms

// global declarations
Servo myServo;          // servo motor object
int angle{};            // current servo angle (0–180 degrees)
bool forward{true};     // sweep direction (true = increasing angle)
bool manualMode{false}; // current mode (true = manual, false = auto)

// function for getting the distance from the ultrasonic sensor
float getDistance() {
    long duration{};  // variable for storing the time it takes for the pulse
    float distance{}; // variable for storing the calculated distance

    // ensure clean low signal before trigger
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);

    // send 10us trigger pulse to start measurement
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    // measure echo return time (timeout 30ms)
    duration = pulseIn(ECHO_PIN, HIGH, 30000);

    if (duration == 0) { // no echo received within timeout
        return -1;
    }

    // convert time to distance (cm), divide by 2 for round trip
    distance = (duration * 0.0343) / 2;

    return distance; // return the calculated distance
}

// function for handling the conditions of the button
bool handleButton() {
    static bool lastReading{HIGH};           // previous raw button read (for edge detection)
    static bool stableState{HIGH};           // debounced stable button state
    static unsigned long lastDebounceTime{}; // time when input last changed (debounce timing)

    bool reading{digitalRead(BUTTON_PIN)}; // current raw button reading
    unsigned long now{millis()};           // current system time in ms

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

// function for detecting change of mode from manual to auto 
bool modeChangedToAuto() {
    static bool lastModeSnapshot{false}; // previous mode state (for detecting transitions)

    bool currentMode{manualMode};                        // current mode snapshot
    bool transitioned{lastModeSnapshot && !currentMode}; // true if manual to auto

    lastModeSnapshot = currentMode; // update stored state for next call

    return transitioned; // return whether transition occurred
}

// main setup
void setup() {
    Serial.begin(115200);

    pinMode(TRIG_PIN, OUTPUT);         // ultrasonic trigger pin
    pinMode(ECHO_PIN, INPUT);          // ultrasonic echo pin
    pinMode(BUTTON_PIN, INPUT_PULLUP); // button input with internal pull-up
    pinMode(POT_PIN, INPUT);           // potentiometer analog input

    myServo.attach(SERVO_PIN); // attach servo to output pin

    angle = 0;            // start at 0 degrees
    myServo.write(angle); // move servo to initial position
    delay(500);           // allow servo to settle
}

// main loop
void loop() {
    bool currentMode{handleButton()}; // check button and get current mode
    int potValue{};                   // variable for raw potentiometer reading
    float distance{};                 // variable for ultrasonic distance reading

    // reset on transition back to auto mode
    if (modeChangedToAuto()) {
        int previousAngle = angle; // store current angle before reset
        angle = 0;                 // reset servo to start position
        forward = true;            // reset sweep direction to forward
        myServo.write(angle);      // move servo to 0 degrees

        int travelDistance = abs(previousAngle - angle); // distance servo must travel
        int settleTime = travelDistance * 2;             // estimated servo settle time (ms)

        delay(settleTime); // wait for servo to reach position
    }

    if (currentMode) {
        // ----- MANUAL MODE -----

        potValue = analogRead(POT_PIN); // read potentiometer value

        angle = map(potValue, 0, 4095, 180, 0); // map pot value to servo angle (reversed)

        myServo.write(angle); // move servo to mapped angle
        delay(30);            // smooth servo response delay

        distance = getDistance(); // measure distance

        // output to serial monitor in this format for processing
        Serial.print(angle);
        Serial.print(",");
        Serial.println(distance);

        delay(15); // delay for stability
    } 
    else {
        // ----- AUTO SWEEP MODE -----

        if (forward) {
            angle += STEP_SIZE; // increase angle

            if (angle >= 180) { // upper limit reached
                angle = 180;     // clamp value
                forward = false; // reverse direction
            }
        } 
        else {
            angle -= STEP_SIZE; // decrease angle

            if (angle <= 0) {   // lower limit reached
                angle = 0;      // clamp value
                forward = true; // reverse direction
            }
        }

        myServo.write(angle);     // update servo position
        delay(30);                // allow servo movement

        distance = getDistance(); // measure distance

        // output to serial monitor in this format for processing
        Serial.print(angle);
        Serial.print(",");
        Serial.println(distance);

        delay(15); // delay for stability
    }
}
