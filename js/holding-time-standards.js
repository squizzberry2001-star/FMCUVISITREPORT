/**
 * STANDAR HOLDING TIME RESMI FAMILYMART INDONESIA
 * Nomor Dokumen: STD/FMI/PD-QC/001/R23
 * Tanggal Efektif: 23 September 2026
 * QA & Product Improvement Division
 */

window.FMCU_HOLDING_TIME_R23 = {
  version: "STD/FMI/PD-QC/001/R23",
  revision: "R23",
  effectiveDate: "2026-09-23",
  effectiveDateFormatted: "23 September 2026",
  title: "STANDAR HOLDING TIME",
  department: "QA & Product Improvement Division",
  approvedBy: "Laurence Alifen (Head of FS Dev, MKT & BD. Division)",
  createdBy: "Rocky Injaya (QA & Product Improvement Head)",
  generalRules: [
    "1 hari = 24 jam.",
    "Thawing pada suhu ruang HARUS menggunakan timer digital.",
    "Holding time setelah thawing / setelah kemasan dibuka / exp date pada label ROX, TIDAK BOLEH melebihi exp date pada kemasan asli.",
    "Pengisian stiker label ROX dan tabel Holding Time HARUS berdasarkan ketentuan resmi ini.",
    "DILARANG KERAS menyimpan produk yang telah melewati Holding Time ke dalam chiller/freezer untuk dijual lagi esok harinya!",
    "Sisa biang teh (Black Tea / Jasmine Tea) saat closing toko HARUS DIBUANG.",
    "Fresh Milk, Oatside, dan Liquid Ice: holding time 24 jam di chiller berlaku jika ada sisa saat closing saja.",
    "PASTIKAN PENYIMPANAN dalam kemasan asli, box wadah, atau plastik klip SELALU TERTUTUP!"
  ],
  categories: [
    {
      id: "fryer",
      name: "Dimasak di Fryer",
      machineTemp: "165°C",
      icon: "fa-fire-burner",
      items: [
        {
          name: "Chicken Parting",
          thawing: "1 hari (Chiller)",
          shelfLife: "36 jam (Chiller)",
          cooking: "12 menit (165°C)",
          holding: "4 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Siomay Ayam Udang (Lama)",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "4 menit (165°C)",
          holding: "4 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Chicken Katsu",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "5 menit (165°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Korean Corn (All Variant)",
          thawing: "30 menit (Suhu Ruang)",
          shelfLife: "12 jam (Chiller)",
          cooking: "5 menit (165°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer • Wajib timer digital saat thawing suhu ruang"
        },
        {
          name: "Egg Ball",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "4 menit (165°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Chicken Karage",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "4 menit (165°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer • Langsung goreng beku"
        },
        {
          name: "Chicken Nugget",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "3 menit (165°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Ebi Furai",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "3 menit (165°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Risoles & Tahu Pedas",
          thawing: "12 jam (Chiller)",
          shelfLife: "2 hari (Chiller)",
          cooking: "3 menit (165°C)",
          holding: "8 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Egg Roll",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "4 menit (165°C)",
          holding: "8 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Shrimp Roll",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "5 menit (165°C)",
          holding: "8 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Boneless Crispy Chicken",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "7 menit (165°C)",
          holding: "8 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        },
        {
          name: "Roti Goreng (All Variant)",
          thawing: "12 jam (Chiller)",
          shelfLife: "5 hari (Chiller)",
          cooking: "Tidak perlu digoreng",
          holding: "8 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Showcase Warmer"
        }
      ]
    },
    {
      id: "steamer",
      name: "Dipanaskan di Steamer",
      machineTemp: "60°C",
      icon: "fa-cloud",
      items: [
        {
          name: "Siomay Ayam Udang (Baru)",
          thawing: "12 jam (Chiller)",
          shelfLife: "4 hari (Chiller)",
          cooking: "min. 20 menit (60°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Steamer 60°C"
        },
        {
          name: "Siomay Ayam Udang (Lama)",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "min. 20 menit (60°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Steamer 60°C"
        },
        {
          name: "Siomay Ikan Bandung",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "min. 20 menit (60°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Steamer 60°C"
        },
        {
          name: "Pao (All Variant)",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "min. 20 menit (60°C)",
          holding: "6 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Steamer 60°C"
        }
      ]
    },
    {
      id: "sosis",
      name: "Dimasak di Mesin Sosis",
      machineTemp: "200°C",
      icon: "fa-hotdog",
      items: [
        {
          name: "Sosis Guling (All Variant)",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "10 menit (200°C)",
          holding: "4 jam (suhu display 70°C) atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Roller grill suhu display 70°C"
        }
      ]
    },
    {
      id: "rice_com",
      name: "Dimasak di Rice Cooker",
      machineTemp: "Otomatis",
      icon: "fa-bowl-rice",
      items: [
        {
          name: "Nasi Putih",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "OTOMATIS (Rice Cooker)",
          holding: "8 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Rice Warmer"
        }
      ]
    },
    {
      id: "oden",
      name: "Dimasak di Mesin Oden",
      machineTemp: "60°C",
      icon: "fa-utensils",
      items: [
        {
          name: "Aneka Oden (Odeng, Spicy Odeng, Fried Fish Cake, Salmon Fish Cake, Spicy Satsumaage, Chicken Dumpling, Cheese Dumpling, Lobster Ball, Chikuwa, Baso Ikan)",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "Saat Opening = min. 30 menit • Tiap Refill = min. 15 menit",
          holding: "10 jam atau closing dibuang (mana yang tercapai lebih dulu)",
          storage: "Mesin Oden 60°C"
        }
      ]
    },
    {
      id: "microwave",
      name: "Dipanaskan di Microwave (RTE)",
      machineTemp: "Microwave High",
      icon: "fa-microchip",
      items: [
        {
          name: "Japanese Sandwich (Jabodetabek)",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "JIKA DIMINTA CUSTOMER: 1 pcs = 10 detik (paper box besar)",
          holding: "Dikonsumsi segera",
          storage: "Chiller display"
        },
        {
          name: "Banana Cake",
          thawing: "12 jam (Chiller)",
          shelfLife: "7 hari (Chiller)",
          cooking: "JIKA DIMINTA CUSTOMER: 1-2 pcs = 20 detik (paper bag gorengan)",
          holding: "Dikonsumsi segera",
          storage: "Chiller display"
        },
        {
          name: "Onigiri (All Variant)",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "JIKA DIMINTA CUSTOMER: 1-2 pcs = 30 detik • 3-4 pcs = 1 menit (kemasan asli)",
          holding: "Dikonsumsi segera",
          storage: "Open Showcase Chiller"
        },
        {
          name: "Deli & Co Burger (Bali / Surabaya)",
          thawing: "24 jam (Chiller)",
          shelfLife: "5 hari (Chiller)",
          cooking: "JIKA DIMINTA CUSTOMER: 1 porsi = 30 detik (kemasan asli)",
          holding: "Dikonsumsi segera",
          storage: "Chiller"
        },
        {
          name: "Panini",
          thawing: "24 jam (Chiller)",
          shelfLife: "7 hari (Chiller)",
          cooking: "JIKA DIMINTA CUSTOMER: 1 porsi = 40 detik (paper bag gorengan)",
          holding: "Dikonsumsi segera",
          storage: "Chiller"
        },
        {
          name: "Sandwich (Surabaya)",
          thawing: "Tidak perlu thawing",
          shelfLife: "-",
          cooking: "JIKA DIMINTA CUSTOMER: 1 porsi = 1 menit (paper box besar). Kecuali Fruit Sandwich tidak perlu dipanaskan",
          holding: "Dikonsumsi segera",
          storage: "Chiller"
        },
        {
          name: "Pasta (Surabaya)",
          thawing: "24 jam (Chiller)",
          shelfLife: "3 hari (Chiller)",
          cooking: "SAAT ADA PESANAN: 1 porsi = 2 menit (kemasan asli)",
          holding: "Dikonsumsi segera",
          storage: "Chiller"
        },
        {
          name: "Udon",
          thawing: "Tidak perlu thawing (boleh disimpan di chiller max 24 jam jika freezer jauh)",
          shelfLife: "24 jam (opsional)",
          cooking: "SAAT ADA PESANAN: 1-2 porsi = 10 detik (paper bowl)",
          holding: "Dikonsumsi segera",
          storage: "Freezer / chiller max 24 jam"
        },
        {
          name: "Tteokbokki / Tteokbokki Keju",
          thawing: "12 jam (Chiller)",
          shelfLife: "3 bulan (Chiller)",
          cooking: "SAAT ADA PESANAN: 1-2 porsi = 1 menit 30 detik (paper bowl)",
          holding: "Dikonsumsi segera",
          storage: "Chiller"
        },
        {
          name: "Sambal Bawang / Geprek",
          thawing: "12 jam (Chiller)",
          shelfLife: "7 hari (Chiller)",
          cooking: "DIPANASKAN SAAT OPENING & REFILL: 20 detik (box bulat)",
          holding: "2 hari SUHU RUANG, saat closing simpan di CHILLER (kontainer bulat)",
          storage: "Suhu ruang siang, simpan chiller saat closing"
        }
      ]
    },
    {
      id: "item_lainnya",
      name: "Item Lainnya & Cake",
      machineTemp: "-",
      icon: "fa-cake-candles",
      items: [
        {
          name: "Bumbu Kacang",
          thawing: "12 jam (Chiller)",
          shelfLife: "5 hari (Chiller)",
          cooking: "WAJIB DIPANASKAN SAAT OPENING & REFILL: Rendam botol squeeze 20 menit di box lion 2.4L isi 1L air akebono",
          holding: "12 jam SUHU RUANG atau closing dibuang (botol squeeze plastik)",
          storage: "Botol squeeze plastik"
        },
        {
          name: "Saus Pedas Siomay",
          thawing: "-",
          shelfLife: "7 hari (Chiller)",
          cooking: "-",
          holding: "5 hari SUHU RUANG, saat closing simpan di CHILLER (botol squeeze plastik)",
          storage: "Simpan chiller saat closing"
        },
        {
          name: "Double Choux & Japanese Roll Cake (Bali & Surabaya)",
          thawing: "24 jam (Chiller)",
          shelfLife: "4 hari (Chiller)",
          cooking: "Tidak perlu dipanaskan",
          holding: "Dikonsumsi segera (Display Open Chiller)",
          storage: "Display Open Chiller"
        },
        {
          name: "Mini Cake / Can Cake (All Variant)",
          thawing: "24 jam (Chiller)",
          shelfLife: "5 hari (Chiller)",
          cooking: "Tidak perlu dipanaskan",
          holding: "Dikonsumsi segera (Display Open Chiller)",
          storage: "Display Open Chiller"
        }
      ]
    },
    {
      id: "dry_condiments",
      name: "Dry Items & Condiments",
      machineTemp: "-",
      icon: "fa-jar",
      items: [
        {
          name: "Tepung Dusting / Beras",
          holding: "Suhu Ruang: H-1 exp.date kemasan asli",
          storage: "Sisa di kemasan asli dalam box 10 L",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Wijen Putih",
          holding: "Suhu Ruang: H-1 exp.date kemasan asli",
          storage: "Tuang ke box bulat / Sisa di kemasan asli",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Salad Bento",
          holding: "Chiller: H-1 exp.date kemasan asli",
          storage: "Tuang ke box 2.4 L (Simpan di Chiller)",
          keterangan: "Wajib simpan di chiller"
        },
        {
          name: "Jeruk Limau",
          holding: "Chiller: 20 hari atau jika warna sudah kecoklatan, mana yang tercapai lebih dulu",
          storage: "Kemasan asli / Tuang ke box bulat",
          keterangan: "Holding time berlaku sejak tanggal kedatangan di toko"
        },
        {
          name: "Saus Odeng",
          holding: "Chiller: 7 hari",
          storage: "Sisa di kemasan asli (Simpan di Chiller)",
          keterangan: "Wajib simpan di chiller"
        },
        {
          name: "Sambal Ijo / Sambal Terasi",
          holding: "Suhu Ruang: 2 hari • Chiller: 1 bulan",
          storage: "Tuang ke box bulat. Sisa kemasan asli di box 2.4 L",
          keterangan: "Saat closing simpan di chiller. Opening/refill dari chiller: microwave 20 detik."
        },
        {
          name: "Gulai Sauce / Cheddar Sauce (Baru) / Mayonaise / Thai Chili Sauce",
          holding: "Suhu Ruang: 5 hari • Chiller: 1 bulan",
          storage: "Tuang ke botol squeeze. Sisa di kemasan asli dalam box 2.4 L",
          keterangan: "Saat closing simpan di chiller. Opening/refill: rendam botol 20 menit di box 2.4L isi 1L air akebono."
        },
        {
          name: "Thousand Island",
          holding: "Suhu Ruang: Tuang ke botol squeeze / plastik zipper • Chiller: 3 bulan",
          storage: "Tuang ke botol squeeze / plastik zipper kecil",
          keterangan: "Saat closing simpan di chiller"
        },
        {
          name: "Saus BBQ / Saus Buldak",
          holding: "Suhu Ruang: 10 hari • Chiller: 1 bulan",
          storage: "Tuang ke botol squeeze & box 2.4 L",
          keterangan: "Saat closing simpan di chiller"
        },
        {
          name: "BBQ Powder / Seaweed Powder / Potato Chips",
          holding: "Suhu Ruang: 2 bulan",
          storage: "Tuang ke box bulat / box 2.4 L / sisa kemasan asli",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Kecap Sedaap",
          holding: "Suhu Ruang: 3 bulan",
          storage: "Sisa di kemasan asli",
          keterangan: "Tutup rapat selalu"
        }
      ]
    },
    {
      id: "beverages",
      name: "Bahan Baku Beverages",
      machineTemp: "-",
      icon: "fa-mug-hot",
      items: [
        {
          name: "Biji Kopi",
          holding: "Suhu Ruang: H-1 exp.date kemasan asli",
          storage: "Tuang ke bean hopper / Sisa di kemasan asli dalam box 10 L",
          keterangan: "Pastikan bean hopper mesin kopi selalu tertutup rapat"
        },
        {
          name: "Choco Dust",
          holding: "Suhu Ruang: H-1 exp.date kemasan asli",
          storage: "Tuang ke box 2.4 L",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Saus Dolce (SKM)",
          holding: "Suhu Ruang: Botol squeeze (closing chiller) • Chiller: H-1 exp.date",
          storage: "Tuang ke botol squeeze / Sisa di box 2.4 L",
          keterangan: "Wajib simpan di chiller saat closing toko"
        },
        {
          name: "Biang Black Tea / Jasmine Tea",
          holding: "Suhu Ruang: 12 jam",
          storage: "Tuang ke jug 2 L bertutup / jug 1.7 L",
          keterangan: "Sisa saat closing toko HARUS DIBUANG!"
        },
        {
          name: "Fresh Milk / Oatside Plain",
          holding: "Chiller: 24 jam",
          storage: "Sisa di kemasan asli (Simpan di Chiller)",
          keterangan: "Berlaku jika ada sisa saat closing saja, simpan di chiller"
        },
        {
          name: "Liquid Fami Ice",
          holding: "Chiller: 24 jam",
          storage: "Tuang ke box 2.4 L (Simpan di Chiller)",
          keterangan: "Berlaku jika ada sisa liquid dari mesin es krim saat closing"
        },
        {
          name: "KSK Mix",
          holding: "Suhu Ruang: 2 hari (Dispenser 6L) • Chiller: 2 hari (Jug 2L)",
          storage: "Tuang ke Liquid Dispenser 6 L / Jug 2L bertutup",
          keterangan: "Saat closing simpan di chiller"
        },
        {
          name: "Sea Salt Foam",
          holding: "Chiller: 3 hari",
          storage: "Tuang ke box 2.4 L",
          keterangan: "Simpan di chiller"
        },
        {
          name: "Sugar Cone (Classic)",
          holding: "Suhu Ruang: 3 hari",
          storage: "Box 10 L",
          keterangan: "Pastikan tertutup rapat agar tetap renyah"
        },
        {
          name: "Arummi Cashew Milk",
          holding: "Chiller: 5 hari",
          storage: "Sisa di kemasan asli (Simpan di Chiller)",
          keterangan: "Simpan di chiller"
        },
        {
          name: "Apple Juice",
          holding: "Chiller: 7 hari",
          storage: "Tuang ke jug 2 L bertutup / jug 1.7 L",
          keterangan: "Simpan di chiller"
        },
        {
          name: "Cranberry Juice",
          holding: "Chiller: 1 bulan",
          storage: "Sisa di kemasan asli dalam box 2.4 L",
          keterangan: "Simpan di chiller"
        },
        {
          name: "Sea Salt Powder",
          holding: "Suhu Ruang: 14 hari",
          storage: "Tuang ke box 2.4 L",
          keterangan: "Simpan tertutup di suhu ruang"
        },
        {
          name: "Orange Juice / Coffee Jelly",
          holding: "Chiller: 3 bulan",
          storage: "Sisa di kemasan asli dalam box 2.4 L",
          keterangan: "Simpan di chiller"
        },
        {
          name: "Brown Sugar Jelly Ball",
          holding: "Suhu Ruang: 5 hari (Box bulat) • Chiller: 3 bulan (Box 2.4L)",
          storage: "Tuang ke box bulat / box 2.4 L",
          keterangan: "Saat closing simpan di chiller"
        },
        {
          name: "Gula Aren (Arenga Sugar)",
          holding: "Suhu Ruang: 14 hari",
          storage: "Tuang ke rak kondimen / box 2.4 L",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Koko Krunch",
          holding: "Suhu Ruang: 1 bulan",
          storage: "Tuang ke box bulat",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Coconut Powder",
          holding: "Suhu Ruang: 1 bulan • Chiller: 1 bulan",
          storage: "Tuang ke box 2.4 L",
          keterangan: "Saat closing simpan di chiller"
        },
        {
          name: "Topping Crunchy Choco / Topping Diced Peanut",
          holding: "Suhu Ruang: 1 bulan",
          storage: "Tuang ke box bulat / Sisa kemasan asli",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Butterscotch Sauce",
          holding: "Suhu Ruang: 1 bulan • Chiller: 1 bulan",
          storage: "Tuang ke botol squeeze / box 2.4 L",
          keterangan: "Saat closing simpan di chiller"
        },
        {
          name: "Sorghum Brown Sugar Liquid",
          holding: "Suhu Ruang: 2 bulan • Chiller: 2 bulan",
          storage: "Sisa di kemasan asli",
          keterangan: "Saat closing simpan di chiller"
        },
        {
          name: "Ruby Chocolate / Peppermint Syrup / Peach Juice / Chocolate Sauce / Gula Aren Cair",
          holding: "Suhu Ruang: 3 bulan",
          storage: "Sisa di kemasan asli",
          keterangan: "Simpan tertutup di suhu ruang"
        },
        {
          name: "Sirup Fructose / Sirup Vanilla",
          holding: "Suhu Ruang: 3 bulan • Chiller: 3 bulan",
          storage: "Tuang ke botol pump / Sisa kemasan dalam box 2.4 L",
          keterangan: "Tutup botol pump selalu bersih"
        },
        {
          name: "Creamer Vana Blanca / Ekstrak Kopi",
          holding: "Suhu Ruang: 3 bulan",
          storage: "Tuang ke rak kondimen / Sisa di kemasan asli box 2.4 L",
          keterangan: "Tutup rapat selalu"
        },
        {
          name: "Daun Black Tea / Jasmine Tea",
          holding: "Suhu Ruang: 3 bulan",
          storage: "Sisa di kemasan asli dalam box 2.4 L",
          keterangan: "Tutup rapat selalu dalam box 2.4 L"
        }
      ]
    }
  ]
};
