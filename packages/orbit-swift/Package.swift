// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "Orbit",
    platforms: [
        .iOS(.v13),
        .macOS(.v10_15),
        .watchOS(.v6),
        .tvOS(.v13)
    ],
    products: [
        .library(
            name: "Orbit",
            targets: ["Orbit"]
        )
    ],
    targets: [
        .target(
            name: "Orbit",
            dependencies: [],
            path: "Sources/Orbit"
        )
    ]
)
