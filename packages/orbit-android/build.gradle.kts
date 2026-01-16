plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("maven-publish")
}

android {
    namespace = "com.orbit.sdk"
    compileSdk = 34

    defaultConfig {
        minSdk = 21
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    publishing {
        singleVariant("release") {
            withSourcesJar()
        }
    }
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}

publishing {
    publications {
        register<MavenPublication>("release") {
            groupId = "com.github.ooAKLoo"
            artifactId = "orbit-android"
            version = "0.1.0"

            afterEvaluate {
                from(components["release"])
            }

            pom {
                name.set("Orbit Android SDK")
                description.set("Lightweight analytics SDK for Android apps - auto-track downloads, DAU, and retention")
                url.set("https://github.com/ooAKLoo/orbit")

                licenses {
                    license {
                        name.set("MIT License")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }

                developers {
                    developer {
                        id.set("ooAKLoo")
                        name.set("Aspect")
                    }
                }

                scm {
                    connection.set("scm:git:github.com/ooAKLoo/orbit.git")
                    developerConnection.set("scm:git:ssh://github.com/ooAKLoo/orbit.git")
                    url.set("https://github.com/ooAKLoo/orbit/tree/master")
                }
            }
        }
    }
}
