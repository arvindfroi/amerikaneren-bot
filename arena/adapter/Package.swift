// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "adapter",
    targets: [
        .executableTarget(
            name: "adapter",
            path: "Sources/adapter"
        )
    ]
)
