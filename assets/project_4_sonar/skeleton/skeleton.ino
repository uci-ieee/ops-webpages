#include <ESP32Servo.h>

// pin definitions
int ECHO_PIN = 4;
int TRIG_PIN = 5;
int SERVO_PIN = 10;
int BUTTON_PIN = 8;
int POT_PIN = 1;

// global declarations
Servo myServo;
int angle = 0;
bool forward = true;
bool manualMode = false;

// main setup
void setup() {
  Serial.begin(115200);
  
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(POT_PIN, INPUT);
  
  myServo.attach(SERVO_PIN);
  
  angle = 0;
  myServo.write(angle);
  delay(500);
}

// main loop
void loop() {
  int potValue = 0;
  float distance = 0;
  
  // check button and toggle mode
  int buttonState = digitalRead(BUTTON_PIN);
  if (buttonState == LOW) {
    manualMode = !manualMode;
    delay(200);
  }
  
  if (manualMode) {
    // ----- MANUAL MODE -----
    
    potValue = analogRead(POT_PIN);
    
    angle = map(potValue, 0, 4095, 180, 0); // can be changed for reading in opposite range
    
    myServo.write(angle);
    delay(30);
    
    // measure distance
    // digitalWrite(TRIG_PIN, LOW);
    // delayMicroseconds(2);
    // digitalWrite(TRIG_PIN, HIGH);
    // delayMicroseconds(10);
    // digitalWrite(TRIG_PIN, LOW);
    
    // long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    
    // if (duration == 0) {
    //   distance = -1;
    // } else {
    //   distance = (duration * 0.0343) / 2;
    // }
    
    // output to serial monitor
    Serial.print(angle);
    Serial.print(",");
    Serial.println(distance);
    
    delay(15);
    
  } else {
    // ----- AUTO SWEEP MODE -----
    
    // if (forward) {
    //   angle = angle + 2;
    //   
    //   if (angle >= 180) {
    //     angle = 180;
    //     forward = false;
    //   }
    // } else {
    //   angle = angle - 2;
    //   
    //   if (angle <= 0) {
    //     angle = 0;
    //     forward = true;
    //   }
    // }
    
    // myServo.write(angle);
    // delay(30);
    
    // measure distance
    // digitalWrite(TRIG_PIN, LOW);
    // delayMicroseconds(2);
    // digitalWrite(TRIG_PIN, HIGH);
    // delayMicroseconds(10);
    // digitalWrite(TRIG_PIN, LOW);
    
    // long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    
    // if (duration == 0) {
    //   distance = -1;
    // } else {
    //   distance = (duration * 0.0343) / 2;
    // }
    
    // output to serial monitor
    // Serial.print(angle);
    // Serial.print(",");
    // Serial.println(distance);
    
    // delay(15);
  }
}
