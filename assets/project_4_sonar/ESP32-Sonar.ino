#include "common.h" 
#include <ESP32Servo.h> 

Servo myServo;      // servo motor object used to control position

int angle{};        // current servo angle (0–180 degrees)
bool forward{true}; // sweep direction (true = increasing angle)

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
    bool manualMode{handleButton()}; // variable for current mode (manual or auto)
    int potValue{};                  // variable for raw potentiometer reading
    float distance{};                // variable for ultrasonic distance reading

    // reset on transition back to auto mode
    if (modeChangedToAuto()) {
        int previousAngle = angle; // variable for storing current angle before reset
        angle = 0;                 // reset servo to start position
        forward = true;            // reset sweep direction to forward
        myServo.write(angle);      // move servo to 0 degrees

        int travelDistance = abs(previousAngle - angle); // variable for distance servo must travel
        int settleTime = travelDistance * 2;             // variable for estimated servo settle time (ms)

        delay(settleTime); // wait for servo to reach position
    }

    if (manualMode) {
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
            angle += STEP_SIZE;   // increase angle

            if (angle >= 180) {  // upper limit reached
                angle = 180;     // clamp value
                forward = false; // reverse direction
            }
        } 
        else {
            angle -= STEP_SIZE;  // decrease angle

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