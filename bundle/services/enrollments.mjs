function generateEnrollmentNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = date.getMonth() + 1;
    const semester = month <= 6 ? 1 : 2;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${year}.${semester}.${randomNum}`;
}

export { generateEnrollmentNumber };
//# sourceMappingURL=enrollments.mjs.map
