document.write(`
<header id="ops-navbar" class="navbar navbar-expand-lg bg-primary sticky-top"  data-bs-theme="dark">
    <nav class="container-xl">
            <a class="navbar-brand" href="./index.html">
                <img src="./assets/images/ops_logo_nobg_100ppi.png" width="50px" alt="OPS Logo">
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarSupportedContent">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                    <li class="nav-item">
                        <a class="nav-link" aria-current="page" href="./index.html">Home</a>
                    </li>
                    <li class="nav-item dropdown ">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            About
                        </a>
                        <ul class="dropdown-menu" data-bs-theme="light" aria-labelledby="navbarDropdown">
                            <li><a class="dropdown-item" href="./faq.html"> FAQ Page</a></li>
                            <li><a class="dropdown-item" href="./syllabus.html"> Syllabus</a></li>
                            <li><a class="dropdown-item" href="./officers.html"> Officers</a></li>
                        </ul>
                    </li>
                    <li class="nav-item dropdown ">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            Projects
                        </a>
                        <ul class="dropdown-menu" data-bs-theme="light" aria-labelledby="navbarDropdown">
                            <li><a class="dropdown-item" href="./project_1.html"> Project 1: LED There Be Light</a></li>
                            <li><a class="dropdown-item" href="./project_2.html">Project 2: 555 Piano</a></li>
                            <li><a class="dropdown-item" href="./project_3.html">Project 3: RGB LED Wizard</a></li>
                            <li><a class="dropdown-item" href="./project_4.html">Project 4: Sundial</a></li>
                            <li><a class="dropdown-item" href="./project_5.html">Project 5: iPoduino v2.0</a></li>
                            <li><a class="dropdown-item" href="./project_6.html">Project 6: Weather Station</a></li>
                            <li><a class="dropdown-item" href="./project_7.html">Project 7: Digital Stopwatch</a></li>
                            <li><a class="dropdown-item" href="./project_8.html">Project 8: 555 Blinker PCB</a></li>
                            <li><a class="dropdown-item" href="./project_capstone.html">Capstone Project</a></li>
                        </ul>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="./lectures.html">Lectures</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="./workshops.html">Workshops</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="./esp32_guide.html">ESP32 Guide</a>
                    </li>
                </ul>
                <a class="bi bi-facebook link-light me-4 fs-5" target="_blank" href="https://www.facebook.com/IEEE.UCI/"></a>
                <a class="bi bi-instagram link-light me-4 fs-5" target="_blank" href="https://www.instagram.com/ieee_uci/?hl=en"></a>
                <a class="bi bi-linkedin link-light me-4 fs-5" target="_blank" href="https://www.linkedin.com/company/ieee-uci/"></a>
                <a class="bi bi-discord link-light me-4 fs-5" target="_blank" href="https://discord.gg/GgRmEvzgvA"></a>
                <a class="link-light me-4" target="_blank" href="https://ieee.ics.uci.edu">
                <img src="./assets/images/ieee_logo.png" width="26px" alt="OPS Logo"></a>
                <!-- Setup JS Script to auto-remove Application Button at end of season. Replace with -->
                <a class="my-sm-0 my-2 btn btn-outline-info" hidden
                    target="_blank"
                    href="https://forms.gle/72Utb9mtvfvz5Cob9">
                    <i class="bi bi-pen me-1"></i>
                    Apply Now
                </a>
            </div>
    </nav>
</header>

`)

const today = new Date(); // January == 0, February == 1 ...
if (today.getMonth() == 5) {
    document.getElementById("ops-navbar").classList.add('pride');
};
