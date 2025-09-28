document.write(`
<header id="ops-navbar" class="navbar navbar-expand-lg bg-primary sticky-top"  data-bs-theme="dark">
    <nav class="container-xl">
            <a class="navbar-brand" href="./index.html">
                <img src="./assets/images/mm_general/mm_logo_whitemaze.PNG" width="80px" alt="OPS Logo">
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarSupportedContent">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                    <li class="nav-item">
                        <a class="nav-link" aria-current="page" href="./mm_index.html">Home</a>
                    </li>
                    <li class="nav-item dropdown ">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            About
                        </a>
                        <ul class="dropdown-menu" data-bs-theme="light" aria-labelledby="navbarDropdown">
                            <li><a class="dropdown-item" href="./mm_faq.html"> FAQ Page</a></li>
                            <li><a class="dropdown-item" href="./mm_syllabus.html"> Syllabus</a></li>
                            <li hidden><a class="dropdown-item" href="./officers.html"> Officers</a></li>
                        </ul>
                    </li>
                    <li class="nav-item dropdown ">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            Modules
                        </a>
                        <ul class="dropdown-menu" data-bs-theme="light" aria-labelledby="navbarDropdown">
                            <li><a class="dropdown-item" href="./schematic.html">Schematic</a></li>
                            <li><a class="dropdown-item" href="./KiCad.html">KiCad</a></li>
                            <li><a class="dropdown-item" href="./floodfill.html">Floodfill</a></li>
                            <li><a class="dropdown-item" href="./MM_simulation.html">Maze Simulation</a></li>
                        </ul>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="./mm_lectures.html">Lectures</a>
                    </li>
                </ul>
                <a class="bi bi-facebook link-light me-4 fs-5" target="_blank" href="https://www.facebook.com/IEEE.UCI/"></a>
                <a class="bi bi-instagram link-light me-4 fs-5" target="_blank" href="https://www.instagram.com/ieee_uci/?hl=en"></a>
                <a class="bi bi-linkedin link-light me-4 fs-5" target="_blank" href="https://www.linkedin.com/company/ieee-uci/"></a>
                <a class="bi bi-discord link-light me-4 fs-5" target="_blank" href="https://discord.gg/GgRmEvzgvA"></a>
                <a class="link-light me-4" target="_blank" href="https://ieee.ics.uci.edu">
                <img src="./assets/images/ieee_logo.png" width="26px" alt="IEEE Logo"></a>
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
