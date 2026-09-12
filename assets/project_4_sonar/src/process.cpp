#include "common.h"
#include <Arduino.h>

// function to ge the distance from the sensor
float getDistance() {
    long duration{};  // variable for storing the time it takes for the pulse
    float distance{}; // variable for storing the calculate distance

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