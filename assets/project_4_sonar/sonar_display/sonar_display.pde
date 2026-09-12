import processing.serial.*;

Serial myPort;
String portName = ""; // Set this to the ESP32 port shown in Arduino IDE.

// Sonar data
int angle = 0;
float distance = 0;
int maxDistance = 20; // Increased to 20cm
float mergeDistance = 20; // pixels (tweak 15–30)

// Display settings
int radarRadius;
PVector center;
color radarGreen = color(0, 255, 100);
color objectRed = color(255, 50, 50);

// Object detection history
ArrayList<DetectedObject> objects = new ArrayList<DetectedObject>();
int objectLifetime = 120; // Increased to ~2 seconds at 60fps (was 60 frames = 1 second)

void setup() {
  size(1200, 800);
  smooth();
  
  // Calculate radar parameters
  radarRadius = min(width, height) / 2 - 100;
  center = new PVector(width * 0.4, height / 2);
  
  // Serial setup
  println("Available serial ports:");
  printArray(Serial.list());
  println("\nChange the port index below to match your ESP32!");
  
  // CHANGE THIS INDEX after checking the list above: Serial.list()[change here] <- add this to the center between 'this' and 115200
  // Common: 0 for COM3, 1 for COM4, etc. on Windows
  //         "/dev/ttyUSB0" or "/dev/ttyACM0" on Linux
  if (portName.length() == 0) {
    println("Set portName to your ESP32 port from the list above, then run again.");
    exit();
    return;
  }
  myPort = new Serial(this, portName, 115200);
  myPort.bufferUntil('\n');
  
  frameRate(60);
}

void draw() {
  // DARKER background - fill with very dark green tint
  fill(0, 5, 0); // Very dark with slight green tint
  noStroke();
  rect(0, 0, width, height);
  
  translate(center.x, center.y);
  
  // Draw radar components
  drawDistanceRings();
  drawAngleLines();
  
  // Draw radar sweep effect (the classic green sweep)
  drawSweep();
  
  // Update and draw detected objects
  updateObjects();
  drawObjects();
  
  // Draw current detection line
  drawDetectionLine();
  
  // Draw center point
  fill(radarGreen);
  noStroke();
  circle(0, 0, 10);
  
  // Reset translation for HUD
  resetMatrix();
  
  // Draw HUD
  drawHUD();
}

void drawDistanceRings() {
  stroke(radarGreen, 30); // Reduced opacity for darker look
  strokeWeight(1);
  noFill();
  
  int numRings = 5;
  for (int i = 1; i <= numRings; i++) {
    float r = radarRadius * i / numRings;
    circle(0, 0, r * 2);
    
    // Distance labels
    fill(radarGreen, 120); // Reduced opacity
    textAlign(CENTER);
    textSize(12);
    int dist = maxDistance * i / numRings;
    text(dist + "cm", r + 10, 5);
  }
}

void drawAngleLines() {
  stroke(radarGreen, 40); // Reduced opacity for darker look
  strokeWeight(1);
  
  // Only draw lines for 0-180° (half circle)
  for (int a = 0; a <= 180; a += 30) {
    float x = cos(radians(a)) * radarRadius;
    float y = -sin(radians(a)) * radarRadius;
    line(0, 0, x, y);
    
    // Angle labels
    fill(radarGreen, 120); // Reduced opacity
    textAlign(CENTER, CENTER);
    textSize(14);
    text(a + "°", x * 1.15, y * 1.15);
  }
  
  // Draw the base line (180° line)
  stroke(radarGreen, 80); // Reduced opacity
  strokeWeight(2);
  line(-radarRadius, 0, radarRadius, 0);
}

void drawDetectionLine() {
  // Current scan line - BRIGHT GREEN
  stroke(radarGreen, 255);
  strokeWeight(3);
  
  float r = radarRadius;
  if (distance > 0 && distance < maxDistance) {
    r = map(distance, 0, maxDistance, 0, radarRadius);
  }
  
  float x = cos(radians(angle)) * radarRadius;
  float y = -sin(radians(angle)) * radarRadius;
  line(0, 0, x, y);
  
  // Detection point
  if (distance > 0 && distance < maxDistance) {
    float px = cos(radians(angle)) * r;
    float py = -sin(radians(angle)) * r;
    
    // Pulsing effect
    float pulse = sin(frameCount * 0.2) * 2 + 6;
    fill(objectRed, 255);
    noStroke();
    circle(px, py, pulse);
    
    // Inner bright spot
    fill(255, 200);
    circle(px, py, 4);
    
    // Add to objects list
    boolean merged = false;

  for (DetectedObject obj : objects) {
    float d = dist(px, py, obj.x, obj.y);
  
    if (d < mergeDistance) {
      // Update existing object instead of adding new one
      obj.x = lerp(obj.x, px, 0.3);  // smooth movement
      obj.y = lerp(obj.y, py, 0.3);
      obj.distance = distance;
      obj.angle = angle;
      obj.age = 0; // reset age since it's still being detected
      merged = true;
      break;
    }
  }

  if (!merged) {
    objects.add(new DetectedObject(px, py, distance, angle));
  }
  }
}

void drawSweep() {
  // Classic radar sweep - ONLY the green sweep visible, no background gradient
  
  // Draw the sweep as a solid wedge that fades from bright to transparent
  noStroke();
  beginShape();
  vertex(0, 0);
  
  // Create the sweep wedge with gradient fade
  for (int i = 0; i <= 40; i++) {
    float a = angle - i * 1.2;
    float alpha = map(i, 0, 40, 60, 0); // Reduced starting opacity for darker look
    
    fill(0, 180, 70, alpha);
    
    float x = cos(radians(a)) * radarRadius;
    float y = -sin(radians(a)) * radarRadius;
    vertex(x, y);
  }
  endShape(CLOSE);
  
  // Add bright edge line at the sweep front
  stroke(80, 255, 140, 255);
  strokeWeight(3);
  float x = cos(radians(angle)) * radarRadius;
  float y = -sin(radians(angle)) * radarRadius;
  line(0, 0, x, y);
}

void updateObjects() {
  // Age and remove old objects
  for (int i = objects.size() - 1; i >= 0; i--) {
    DetectedObject obj = objects.get(i);
    obj.age++;
    if (obj.age > objectLifetime) {
      objects.remove(i);
    }
  }
}

void drawObjects() {
  // Draw all detected objects with fade
  for (DetectedObject obj : objects) {
    float alpha = map(obj.age, 0, objectLifetime, 200, 0);
    
    fill(objectRed, alpha);
    noStroke();
    float size = map(obj.age, 0, objectLifetime, 6, 2);
    circle(obj.x, obj.y, size);
  }
}

void drawHUD() {
  // Info panel background
  fill(0, 200); // Darker background
  noStroke();
  rect(width - 300, 0, 300, height);
  
  // Title
  fill(radarGreen);
  textAlign(LEFT);
  textSize(28);
  text("ESP32 SONAR", width - 280, 50);
  
  // Divider
  stroke(radarGreen, 200);
  strokeWeight(2);
  line(width - 280, 70, width - 20, 70);
  
  // Current readings
  noStroke();
  textSize(18);
  int yPos = 120;
  
  fill(radarGreen, 200);
  text("ANGLE", width - 280, yPos);
  fill(255);
  textSize(32);
  text(nf(angle, 3) + "°", width - 280, yPos + 35);
  yPos += 80;
  
  fill(radarGreen, 200);
  textSize(18);
  text("DISTANCE", width - 280, yPos);
  fill(255);
  textSize(32);
  if (distance > 0 && distance < maxDistance) {
    text(nf(distance, 0, 1) + " cm", width - 280, yPos + 35);
  } else {
    fill(radarGreen, 150);
    text("---", width - 280, yPos + 35);
  }
  yPos += 100;
  
  // Status indicator
  fill(radarGreen, 200);
  textSize(18);
  text("STATUS", width - 280, yPos);
  yPos += 30;
  
  if (distance > 0 && distance < maxDistance) {
    fill(objectRed);
    noStroke();
    circle(width - 260, yPos, 15);
    fill(objectRed, 200);
    textSize(20);
    text("OBJECT DETECTED", width - 240, yPos + 5);
  } else {
    fill(radarGreen);
    noStroke();
    circle(width - 260, yPos, 15);
    fill(radarGreen, 200);
    textSize(20);
    text("CLEAR", width - 240, yPos + 5);
  }
  yPos += 80;
  
  // Range info
  fill(radarGreen, 150);
  textSize(14);
  text("Max Range: " + maxDistance + " cm", width - 280, yPos);
  yPos += 25;
  text("Sweep: 0° - 180°", width - 280, yPos);
  yPos += 25;
  text("Objects Tracked: " + objects.size(), width - 280, yPos);
  
  // Footer
  yPos = height - 40;
  fill(radarGreen, 100);
  textSize(12);
  text("FPS: " + nf(frameRate, 0, 1), width - 280, yPos);
}

void serialEvent(Serial p) {
  String data = p.readStringUntil('\n');
  
  if (data != null) {
    data = trim(data);
    
    // Skip non-data lines (like "Sonar system starting...")
    if (!data.contains(",")) {
      return;
    }
    
    String[] values = split(data, ',');
    if (values.length == 2) {
      try {
        angle = int(values[0]);
        distance = float(values[1]);
        
        // Clamp values for safety
        angle = constrain(angle, 0, 180);
        if (distance < 0) {
          distance = maxDistance + 1; // out of range
        }
      } catch (Exception e) {
        println("Parse error: " + data);
      }
    }
  }
}

// Object detection class
class DetectedObject {
  float x, y;
  float distance;
  int angle;
  int age;
  
  DetectedObject(float x, float y, float distance, int angle) {
    this.x = x;
    this.y = y;
    this.distance = distance;
    this.angle = angle;
    this.age = 0;
  }
}