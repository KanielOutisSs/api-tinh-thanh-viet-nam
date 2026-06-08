const AddressConverter = require('./addressConverter');

const converter = new AddressConverter();
console.log("Loading dataset...");
converter.loadData(
    './data/donvi_tinhthanh.json',
    './data/simplified_json_generated_data_vn_units.json'
);
console.log("Dataset loaded successfully!");

const tests = [
    {
        name: 'Trường hợp không dấu phẩy, viết thường, có sáp nhập và đổi tên khu phố (Uông Bí)',
        input: 'tổ 3 khu 1 quang trung uông bí quảng ninh',
        expected: 'Tổ 3 Khu phố Quang Trung 1, Phường Uông Bí, Tỉnh Quảng Ninh'
    },
    {
        name: 'Trường hợp phân cách bằng dấu gạch ngang (Lê Đại Hành -> Phường Hai Bà Trưng)',
        input: 'Lê Đại Hành - Hai Bà Trưng - Hà Nội',
        expected: 'Phường Hai Bà Trưng, Thành phố Hà Nội'
    },
    {
        name: 'Trường hợp thay đổi địa giới hành chính cấp tỉnh và sáp nhập xã (Thạch Hòa -> Hoà Lạc, Hà Tây -> Hà Nội)',
        input: 'Xã Thạch Hòa, Huyện Thạch Thất, Tỉnh Hà Tây',
        expected: 'Xã Hoà Lạc, Thành phố Hà Nội'
    },
    {
        name: 'Trường hợp có dấu phẩy, sáp nhập xã cũ sang xã mới và mất cấp huyện trong đầu vào',
        input: 'thôn lũng giềng, xuân lập, lâm bình tuyên quang',
        expected: 'Thôn Lũng Giềng, Xã Lâm Bình, Tỉnh Tuyên Quang'
    },
    {
        name: 'Trường hợp có dấu phẩy đầy đủ, sáp nhập phường cũ (Quang Trung) sang phường mới (Uông Bí)',
        input: 'Tổ 3, khu 1, phường Quang Trung, Uông Bí, Quảng Ninh',
        expected: 'Tổ 3, Khu phố Quang Trung 1, Phường Uông Bí, Tỉnh Quảng Ninh'
    },
    {
        name: 'Trường hợp viết tắt đơn vị hành chính và không dấu phẩy đầy đủ',
        input: 'p. quang trung, tp. uông bí, t. quảng ninh',
        expected: 'Phường Uông Bí, Tỉnh Quảng Ninh'
    },
    {
        name: 'Trường hợp viết tắt dính liền không khoảng cách và trùng tên đường/phường (đường Lê Lợi)',
        input: 'số 15 đường lê lợi, p.quang trung, tp.uông bí, t.quảng ninh',
        expected: 'Số 15 Đường Lê Lợi, Phường Uông Bí, Tỉnh Quảng Ninh'
    },
    {
        name: 'Trường hợp không dấu phẩy, sáp nhập tỉnh cũ (Bình Định -> Gia Lai) và xã cũ có trùng tên (An Hoà)',
        input: 'thôn 5 xã an hoà an lão bình định',
        expected: 'Thôn 5, Xã An Hoà, Tỉnh Gia Lai'
    },
    {
        name: 'Trường hợp viết tắt "Tt" mang ý nghĩa "Tập thể" (collective building) chứ không phải "Thị trấn"',
        input: '7 Nhà E - Tt 81 Vân Hồ 3 - Lê Đại Hành - Hai Bà Trưng - Hà Nội',
        expected: '7 Nhà E, Tập thể 81 Vân Hồ 3, Phường Hai Bà Trưng, Thành phố Hà Nội'
    },
    {
        name: 'Trường hợp sáp nhập Phường Cầu Diễn và Quận Nam Từ Liêm thành Phường Từ Liêm',
        input: 'Tổ Dân Phố Số 10 Cầu Diễn, Nam Từ Liêm, Hà Nội',
        expected: 'Tổ Dân Phố Số 10, Phường Từ Liêm, Thành phố Hà Nội'
    },
    {
        name: 'Trường hợp sáp nhập Xã Trung Minh và Huyện Yên Sơn thành Xã Hùng Lợi (typo Xã Yên Sơn)',
        input: 'Thôn Minh Lợi Trung Minh, Xã Yên Sơn, Tỉnh Tuyên Quang',
        expected: 'Thôn Minh Lợi, Xã Hùng Lợi, Tỉnh Tuyên Quang'
    }
];

let allPassed = true;

for (const t of tests) {
    const result = converter.convertAddress(t.input);
    console.log(`\n--- ${t.name} ---`);
    console.log(`Input:    "${t.input}"`);
    console.log(`Output:   "${result}"`);
    console.log(`Expected: "${t.expected}"`);
    if (result.toLowerCase() === t.expected.toLowerCase()) {
        console.log(`✅ PASSED`);
    } else {
        console.log(`❌ FAILED`);
        allPassed = false;
    }
}

if (!allPassed) {
    console.error("\n❌ Some tests FAILED!");
    process.exit(1);
} else {
    console.log("\n✅ All tests PASSED successfully!");
}
