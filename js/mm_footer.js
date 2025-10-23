document.write(`
<footer class ="py-4 mt-5 bg-body-tertiary">
<div class="container py-5 px-5 my-5 text-body-secondary">
    <a class="d-inline-flex align-items-center text-decoration-none text-body-secondary mb-2">
        <img class="img-fluid me-2 d-block" style="max-width: 30px;" src="./assets/images/mm_general/mm_logo_transparent_gs.png">
        <span class="" style="font-size: 1.2rem;">Micromouse</span>
    </a>
    <ul class="list-unstyled small">
        <li>
            Website designed by the 2025-2026 UCI Micromouse Staff
        </li>
        <li>
            CC BY-NC-SA 2025 Institute of Electrical and Electronics Engineers, UC Irvine Branch
        </li>
        <br>
        <li>
        <strong>Fair Use Act Disclaimer</strong>
        <br>
        This site is for educational purposes only.
        <br><br>
        <strong>Fair Use</strong>
        <br>
        Copyright Disclaimer under section 107 of the Copyright Act of 1976, allowance is made for “fair use” for purposes such as criticism, comment, news reporting, teaching, scholarship, education and research.
        Fair use is a use permitted by copyright statute that might otherwise be infringing.
        <br><br>
        <strong>Fair Use Definition</strong>
        <br>
        Fair use is a doctrine in United States copyright law that allows limited use of copyrighted material without requiring permission from the rights holders, such as commentary, criticism, news reporting, research, teaching or scholarship. It provides for the legal, non-licensed citation or incorporation of copyrighted material in another author’s work under a four-factor balancing test.
        </li>
    </ul>

    <ul class="list-unstyled small">
    <li class="fw-bold">
        Have Questions? Contact Us
    </li>
    <li>
        Email | <a href="mailto:ieee@uci.edu">ieee@uci.edu<a>
    </li>
    <li>
        Lead Instructor | Reza Bagheri
    </li>
</ul>
</div>

<script>
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]')
    const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl, {html: true}))

    document.querySelectorAll('.pj-code').forEach(el => {

    hljs.highlightElement(el);
    });
</script>
</footer>

`)
